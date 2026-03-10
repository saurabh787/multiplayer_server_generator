import { appendFileSync } from "node:fs";
import { GameServer } from "./src/public/game-server";
import { LoadClient } from "./scripts/_client";
import { Opcode } from "./src/types/opcode";

type Slot = {
  id: number;
  token: string;
  client?: LoadClient;
  connected: boolean;
  roomType: string;
  inputTimer?: NodeJS.Timeout;
};

type SoakOptions = {
  label: string;
  durationMs: number;
  clients: number;
  port: number;
  metricsPort: number;
};

type InternalServerLike = {
  roomManager: { getAllRooms: () => Array<any>; getRoom: (roomId: string) => any | undefined };
  players: Map<string, any>;
  sessions: Map<string, any>;
  realtimeEngines: Map<string, any>;
  turnEngines: Map<string, any>;
};

const TELEMETRY_PATH = "telemetry.log";

function log(tag: string, payload: Record<string, unknown>): void {
  const line = `${new Date().toISOString()} ${tag} ${JSON.stringify(payload)}`;
  appendFileSync(TELEMETRY_PATH, `${line}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(items: T[], count: number): T[] {
  const copy = [...items];
  const out: T[] = [];
  while (copy.length > 0 && out.length < count) {
    const idx = rand(0, copy.length - 1);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

async function runSoak(options: SoakOptions): Promise<{ pass: boolean }> {
  const server = new GameServer({
    config: {
      port: options.port,
      metricsPort: options.metricsPort,
      reconnectGraceMs: 20_000,
      tickRate: 20,
      slowTickThresholdMs: 10
    }
  });

  await server.start();
  const internal = (server as unknown as { internal?: InternalServerLike }).internal;
  if (!internal) {
    throw new Error("Unable to access internal server for diagnostics");
  }

  const url = `ws://localhost:${options.port}`;
  const slots: Slot[] = Array.from({ length: options.clients }, (_, i) => ({
    id: i,
    token: `${options.label}-user-${i}`,
    connected: false,
    roomType: `zone-${i % 5}`
  }));

  const startedAt = Date.now();
  const roomFirstSeenAt = new Map<string, number>();
  const roomLastSeenPlayers = new Map<string, number>();
  const zombieRoomSeen = new Set<string>();
  let previousRoomIds = new Set<string>();

  let running = true;
  let sentInputs = 0;
  let disconnects = 0;
  let reconnectAttempts = 0;
  let reconnectSuccess = 0;
  let roomMigrations = 0;
  let unhandledRejections = 0;
  let uncaughtExceptions = 0;
  let warnings = 0;
  let peakLagMs = 0;
  let lagMs = 0;
  let lagLast = Date.now();

  const handleSeries: number[] = [];
  const heapSeries: number[] = [];
  const roomSeries: number[] = [];
  const orphanEngineSeries: number[] = [];
  const ghostPlayerSeries: number[] = [];

  const onUnhandledRejection = (reason: unknown): void => {
    unhandledRejections += 1;
    log("[diag-unhandled-rejection]", { label: options.label, reason: String(reason) });
  };

  const onUncaughtException = (error: Error): void => {
    uncaughtExceptions += 1;
    log("[diag-uncaught-exception]", { label: options.label, name: error.name, message: error.message });
  };

  const onWarning = (warning: Error): void => {
    warnings += 1;
    log("[diag-warning]", { label: options.label, name: warning.name, message: warning.message });
  };

  process.on("unhandledRejection", onUnhandledRejection);
  process.on("uncaughtException", onUncaughtException);
  process.on("warning", onWarning);

  const clearInputLoop = (slot: Slot): void => {
    if (slot.inputTimer) {
      clearTimeout(slot.inputTimer);
      slot.inputTimer = undefined;
    }
  };

  const scheduleInput = (slot: Slot): void => {
    clearInputLoop(slot);
    const tick = (): void => {
      if (!running || !slot.connected || !slot.client || slot.client.isClosed()) {
        return;
      }
      slot.client.send(Opcode.INPUT, {
        tick: Date.now(),
        input: {
          type: "move",
          payload: {
            x: rand(0, 500),
            y: rand(0, 500),
            t: Date.now()
          }
        }
      });
      sentInputs += 1;
      slot.inputTimer = setTimeout(tick, rand(80, 200));
    };
    slot.inputTimer = setTimeout(tick, rand(80, 200));
  };

  const connectSlot = async (slot: Slot): Promise<void> => {
    const client = new LoadClient(url);
    await client.waitOpen();
    client.send(Opcode.AUTH, { protocolVersion: 1, token: slot.token });
    const auth = await client.waitFor(Opcode.AUTH_OK);
    if (auth.reconnected === true) {
      reconnectSuccess += 1;
    }
    slot.client = client;
    slot.connected = true;

    client.send(Opcode.MATCH_JOIN, {
      mode: "realtime",
      roomType: slot.roomType,
      requiredPlayers: 2,
      maxPlayers: 4
    });

    scheduleInput(slot);
  };

  const disconnectSlot = (slot: Slot): void => {
    if (!slot.connected || !slot.client) {
      return;
    }
    clearInputLoop(slot);
    slot.client.close();
    slot.client = undefined;
    slot.connected = false;
    disconnects += 1;
  };

  for (const slot of slots) {
    await connectSlot(slot);
  }

  log("[diag-start]", {
    label: options.label,
    durationMs: options.durationMs,
    clients: options.clients,
    url
  });

  const lagTimer = setInterval(() => {
    const now = Date.now();
    lagMs = now - lagLast - 1000;
    lagLast = now;
    if (lagMs > peakLagMs) {
      peakLagMs = lagMs;
    }
  }, 1000);

  let churnBusy = false;
  const churnTimer = setInterval(() => {
    if (!running || churnBusy) {
      return;
    }
    churnBusy = true;
    void (async () => {
      const connected = slots.filter((s) => s.connected);
      const toDrop = pickRandom(connected, rand(3, 5));
      for (const slot of toDrop) {
        disconnectSlot(slot);
      }

      await sleep(rand(800, 2200));
      const disconnected = slots.filter((s) => !s.connected);
      const toReconnect = pickRandom(disconnected, Math.min(toDrop.length, disconnected.length));
      reconnectAttempts += toReconnect.length;
      for (const slot of toReconnect) {
        try {
          await connectSlot(slot);
        } catch (error) {
          log("[diag-reconnect-fail]", {
            label: options.label,
            slotId: slot.id,
            error: String(error)
          });
        }
      }
    })().finally(() => {
      churnBusy = false;
    });
  }, 15_000);

  let roomBusy = false;
  let cycle = 0;
  const roomTimer = setInterval(() => {
    if (!running || roomBusy) {
      return;
    }
    roomBusy = true;
    void (async () => {
      cycle += 1;
      const connected = slots.filter((s) => s.connected && s.client);
      const movers = pickRandom(connected, Math.min(8, connected.length));
      for (const slot of movers) {
        const client = slot.client;
        if (!client) {
          continue;
        }
        slot.roomType = `cycle-${cycle % 4}`;
        client.send(Opcode.ROOM_LEAVE, {});
        await sleep(rand(40, 120));
        client.send(Opcode.MATCH_JOIN, {
          mode: "realtime",
          roomType: slot.roomType,
          requiredPlayers: 2,
          maxPlayers: 4
        });
        roomMigrations += 1;
      }
    })().finally(() => {
      roomBusy = false;
    });
  }, 30_000);

  const metricTimer = setInterval(() => {
    const mem = process.memoryUsage();
    const apiMetrics = server.metrics() as Record<string, unknown>;

    const rooms = internal.roomManager.getAllRooms();
    const roomMap = new Map<string, any>(rooms.map((r) => [r.id as string, r]));
    const realtimeEngineIds = [...internal.realtimeEngines.keys()];

    const zombieRooms = rooms.filter((room) => (room.players?.size ?? 0) === 0);
    for (const room of zombieRooms) {
      zombieRoomSeen.add(room.id);
    }

    let ghostPlayers = 0;
    for (const room of rooms) {
      for (const player of room.players?.values?.() ?? []) {
        if (player.roomId !== room.id) {
          ghostPlayers += 1;
        }
      }
    }

    let playersPointingToMissingRoom = 0;
    let playersMissingMembership = 0;
    for (const player of internal.players.values()) {
      if (!player.roomId) {
        continue;
      }
      const room = roomMap.get(player.roomId);
      if (!room) {
        playersPointingToMissingRoom += 1;
        continue;
      }
      if (!room.players?.has?.(player.id)) {
        playersMissingMembership += 1;
      }
    }

    const orphanEngineIds = realtimeEngineIds.filter((roomId) => !roomMap.has(roomId));

    const currentRoomIds = new Set<string>(rooms.map((r) => r.id as string));
    for (const room of rooms) {
      if (!roomFirstSeenAt.has(room.id)) {
        roomFirstSeenAt.set(room.id, Date.now());
      }
      roomLastSeenPlayers.set(room.id, room.players?.size ?? 0);
    }

    for (const oldRoomId of previousRoomIds) {
      if (!currentRoomIds.has(oldRoomId)) {
        const firstSeen = roomFirstSeenAt.get(oldRoomId) ?? Date.now();
        const ageSec = Math.floor((Date.now() - firstSeen) / 1000);
        log("[diag-room-disposed]", {
          label: options.label,
          roomId: oldRoomId,
          ageSec,
          lastSeenPlayers: roomLastSeenPlayers.get(oldRoomId) ?? -1
        });
      }
    }
    previousRoomIds = currentRoomIds;

    const metric = {
      label: options.label,
      sec: Math.floor((Date.now() - startedAt) / 1000),
      heapMB: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
      rssMB: Number((mem.rss / 1024 / 1024).toFixed(2)),
      handles: (process as any)._getActiveHandles().length,
      lagMs,
      rooms: rooms.length,
      realtimeEngines: internal.realtimeEngines.size,
      turnEngines: internal.turnEngines.size,
      sessions: internal.sessions.size,
      players: internal.players.size,
      zombies: zombieRooms.length,
      ghostPlayers,
      playersPointingToMissingRoom,
      playersMissingMembership,
      orphanEngines: orphanEngineIds.length,
      roomsCreated: Number(apiMetrics.roomsCreated ?? 0),
      roomsDestroyed: Number(apiMetrics.roomsDestroyed ?? 0)
    };

    handleSeries.push(metric.handles);
    heapSeries.push(metric.heapMB);
    roomSeries.push(metric.rooms);
    orphanEngineSeries.push(metric.orphanEngines);
    ghostPlayerSeries.push(metric.ghostPlayers + metric.playersPointingToMissingRoom + metric.playersMissingMembership);

    log("[diag-metric]", metric);
  }, 5_000);

  const zombieTimer = setInterval(() => {
    const rooms = internal.roomManager.getAllRooms();
    const zombies = rooms.filter((room) => (room.players?.size ?? 0) === 0);
    if (zombies.length === 0) {
      log("[zombie-check]", { label: options.label, result: "none" });
      return;
    }
    for (const room of zombies) {
      const firstSeen = roomFirstSeenAt.get(room.id) ?? Date.now();
      const ageSec = Math.floor((Date.now() - firstSeen) / 1000);
      log("[zombie-room]", {
        label: options.label,
        roomId: room.id,
        roomType: room.roomType,
        state: room.state,
        ageSec,
        players: room.players?.size ?? 0,
        pendingRemovals: room.pendingRemovals?.size ?? 0
      });
    }
  }, 30_000);

  await sleep(options.durationMs);
  running = false;
  await sleep(1500);

  clearInterval(lagTimer);
  clearInterval(churnTimer);
  clearInterval(roomTimer);
  clearInterval(metricTimer);
  clearInterval(zombieTimer);

  for (const slot of slots) {
    clearInputLoop(slot);
    if (slot.client) {
      slot.client.close();
      slot.client = undefined;
    }
    slot.connected = false;
  }

  await sleep(1000);
  await server.stop();

  process.off("unhandledRejection", onUnhandledRejection);
  process.off("uncaughtException", onUncaughtException);
  process.off("warning", onWarning);

  const completedSec = Math.floor((Date.now() - startedAt) / 1000);
  const heapStart = heapSeries[0] ?? 0;
  const heapEnd = heapSeries[heapSeries.length - 1] ?? 0;
  const heapPeak = heapSeries.reduce((m, v) => Math.max(m, v), 0);
  const handlesStart = handleSeries[0] ?? 0;
  const handlesEnd = handleSeries[handleSeries.length - 1] ?? 0;
  const roomStart = roomSeries[0] ?? 0;
  const roomEnd = roomSeries[roomSeries.length - 1] ?? 0;
  const roomPeak = roomSeries.reduce((m, v) => Math.max(m, v), 0);
  const orphanPeak = orphanEngineSeries.reduce((m, v) => Math.max(m, v), 0);
  const ghostPeak = ghostPlayerSeries.reduce((m, v) => Math.max(m, v), 0);

  const pass =
    completedSec >= Math.floor(options.durationMs / 1000) &&
    warnings === 0 &&
    unhandledRejections === 0 &&
    uncaughtExceptions === 0 &&
    orphanPeak === 0 &&
    ghostPeak === 0;

  log("[diag-summary]", {
    label: options.label,
    completedSec,
    sentInputs,
    disconnects,
    reconnectAttempts,
    reconnectSuccess,
    roomMigrations,
    warnings,
    unhandledRejections,
    uncaughtExceptions,
    zombieRoomUniqueCount: zombieRoomSeen.size,
    heapStartMB: heapStart,
    heapEndMB: heapEnd,
    heapPeakMB: heapPeak,
    handlesStart,
    handlesEnd,
    peakLagMs,
    roomStart,
    roomEnd,
    roomPeak,
    orphanPeak,
    ghostPeak,
    pass
  });

  return { pass };
}

async function main(): Promise<void> {
  log("[diag-phase]", { step: "full-soak-15m-60", durationSec: 900, clients: 60 });
  const full = await runSoak({
    label: "full-soak-15m-60",
    durationMs: 900_000,
    clients: 60,
    port: 3370,
    metricsPort: 3371
  });

  log("[diag-overall]", { overallPass: full.pass });
  if (!full.pass) {
    process.exitCode = 1;
  }
}

void main();
