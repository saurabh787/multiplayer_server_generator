import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import WebSocket from "ws";
import { GameServer } from "../src/public/game-server";
import { PlayerContext } from "../src/public/player-context";
import { Room } from "../src/public/room";
import type { Transport, TransportEvents } from "../src/public/transport";
import { decodePacket, encodePacket } from "../src/protocol/protocol";
import { WebSocketTransport } from "../src/transport/websocket-transport";
import { Opcode } from "../src/types/opcode";

function toBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.from(new Uint8Array(data));
}

interface TestClient {
  close: () => Promise<void>;
  waitFor: (opcode: Opcode, timeoutMs?: number) => Promise<Record<string, unknown>>;
  waitForRoomMessage: (type: string, timeoutMs?: number) => Promise<Record<string, unknown>>;
  send: (opcode: Opcode, payload: Record<string, unknown>) => void;
}

function createClient(url: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const queue: Array<{ opcode: number; payload: Record<string, unknown> }> = [];
    ws.on("open", () => {
      resolve({
        close: async () => {
          if (ws.readyState === WebSocket.CLOSED) {
            return;
          }
          ws.close();
          await once(ws, "close");
        },
        waitFor: async (opcode, timeoutMs = 3000) => {
          const start = Date.now();
          while (Date.now() - start < timeoutMs) {
            const item = queue.find((entry) => entry.opcode === opcode);
            if (item) {
              queue.splice(queue.indexOf(item), 1);
              return item.payload;
            }
            await new Promise((r) => setTimeout(r, 10));
          }
          throw new Error(`Timed out waiting for opcode ${opcode}`);
        },
        waitForRoomMessage: async (type, timeoutMs = 3000) => {
          const start = Date.now();
          while (Date.now() - start < timeoutMs) {
            const item = queue.find((entry) => entry.opcode === Opcode.ROOM_MESSAGE && entry.payload.type === type);
            if (item) {
              queue.splice(queue.indexOf(item), 1);
              return item.payload;
            }
            await new Promise((r) => setTimeout(r, 10));
          }
          throw new Error(`Timed out waiting for ROOM_MESSAGE(${type})`);
        },
        send: (opcode, payload) => ws.send(encodePacket(opcode, payload))
      });
    });
    ws.on("error", reject);
    ws.on("message", (data, isBinary) => {
      if (!isBinary || typeof data === "string") {
        return;
      }
      const packet = decodePacket(toBuffer(data), 8192);
      if (packet.opcode === Opcode.PING) {
        ws.send(encodePacket(Opcode.PONG, { ts: Date.now() }));
        return;
      }
      queue.push(packet);
    });
  });
}

class BattleRoom extends Room<{ moves: number }> {
  public onCreate(): void {
    this.state = { moves: 0 };
  }

  public onJoin(player: PlayerContext): void {
    this.send(player, "welcome", { id: player.id });
  }

  public onMessage(player: PlayerContext, type: string, payload: unknown): void {
    if (type !== "move") {
      return;
    }
    this.state.moves += 1;
    this.send(player, "moved", {
      moves: this.state.moves,
      payload
    });
  }
}

class DelegatingTransport implements Transport {
  public bindingsSet = false;
  private config?: Record<string, unknown>;
  private events?: TransportEvents;
  private metricsProvider: () => Record<string, unknown> = () => ({});
  private inner?: WebSocketTransport;

  public setBindings(
    config: Record<string, unknown>,
    events: TransportEvents,
    metricsProvider: () => Record<string, unknown>
  ): void {
    this.bindingsSet = true;
    this.config = config;
    this.events = events;
    this.metricsProvider = metricsProvider;
  }

  public async listen(): Promise<void> {
    if (!this.config || !this.events) {
      throw new Error("transport not configured");
    }
    this.inner = new WebSocketTransport(this.config as never, this.events as never, this.metricsProvider);
    await this.inner.listen();
  }

  public async close(): Promise<void> {
    await this.inner?.close();
  }

  public send(sessionId: string, opcode: number, payload: Record<string, unknown>): void {
    this.inner?.send(sessionId, opcode, payload);
  }

  public disconnect(sessionId: string): void {
    this.inner?.disconnect(sessionId);
  }
}

test("public defineRoom binds Room subclass into runtime execution", async () => {
  const basePort = 35_000 + Math.floor(Math.random() * 1_000);
  const server = new GameServer({
    config: {
      port: basePort,
      metricsPort: basePort + 1,
      tickRate: 20
    }
  });
  server.defineRoom("battle", BattleRoom, {
    engine: "realtime",
    maxClients: 2
  });
  let a: TestClient | undefined;
  let b: TestClient | undefined;
  let started = false;
  try {
    await server.start();
    started = true;

    a = await createClient(`ws://localhost:${basePort}`);
    b = await createClient(`ws://localhost:${basePort}`);
    a.send(Opcode.AUTH, { protocolVersion: 1 });
    b.send(Opcode.AUTH, { protocolVersion: 1 });
    await a.waitFor(Opcode.AUTH_OK);
    await b.waitFor(Opcode.AUTH_OK);

    a.send(Opcode.MATCH_JOIN, { roomType: "battle", requiredPlayers: 2, maxPlayers: 2 });
    b.send(Opcode.MATCH_JOIN, { roomType: "battle", requiredPlayers: 2, maxPlayers: 2 });
    await a.waitFor(Opcode.MATCH_FOUND);
    await b.waitFor(Opcode.MATCH_FOUND);
    await a.waitFor(Opcode.ROOM_JOINED);
    await b.waitFor(Opcode.ROOM_JOINED);

    const welcome = await a.waitForRoomMessage("welcome");
    assert.equal(welcome.type, "welcome");

    a.send(Opcode.INPUT, {
      tick: 1,
      input: {
        type: "move",
        payload: { x: 4 }
      }
    });

    const moved = await a.waitForRoomMessage("moved");
    assert.equal(moved.type, "moved");
    const movedPayload = moved.payload as { moves?: number };
    assert.equal(movedPayload.moves, 1);

    const snapshot = await a.waitFor(Opcode.SNAPSHOT, 5000);
    const state = snapshot.s as { moves?: number };
    assert.equal(typeof state.moves, "number");
  } finally {
    await Promise.all([a?.close(), b?.close()].filter(Boolean) as Array<Promise<void>>);
    if (started) {
      await server.stop();
    }
  }
});

test("public transport injection is used when provided in config", async () => {
  const basePort = 36_000 + Math.floor(Math.random() * 1_000);
  const transport = new DelegatingTransport();
  const server = new GameServer({
    config: {
      port: basePort,
      metricsPort: basePort + 1,
      transport
    }
  });
  let started = false;
  let client: TestClient | undefined;
  try {
    await server.start();
    started = true;
    assert.equal(transport.bindingsSet, true);

    client = await createClient(`ws://localhost:${basePort}`);
    client.send(Opcode.AUTH, { protocolVersion: 1 });
    const authOk = await client.waitFor(Opcode.AUTH_OK);
    assert.equal(typeof authOk.playerId, "string");
  } finally {
    await client?.close();
    if (started) {
      await server.stop();
    }
  }
});

test("migration keeps each player in exactly one room membership", async () => {
  const basePort = 38_000 + Math.floor(Math.random() * 1_000);
  const server = new GameServer({
    config: {
      port: basePort,
      metricsPort: basePort + 1,
      reconnectGraceMs: 20_000
    }
  });

  let started = false;
  let a: TestClient | undefined;
  let b: TestClient | undefined;
  try {
    await server.start();
    started = true;

    a = await createClient(`ws://localhost:${basePort}`);
    b = await createClient(`ws://localhost:${basePort}`);
    a.send(Opcode.AUTH, { protocolVersion: 1, token: "migrate-a" });
    b.send(Opcode.AUTH, { protocolVersion: 1, token: "migrate-b" });
    await a.waitFor(Opcode.AUTH_OK);
    await b.waitFor(Opcode.AUTH_OK);

    a.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });
    b.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });
    await a.waitFor(Opcode.MATCH_FOUND);
    await b.waitFor(Opcode.MATCH_FOUND);
    await a.waitFor(Opcode.ROOM_JOINED);
    await b.waitFor(Opcode.ROOM_JOINED);

    a.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena-migrate", requiredPlayers: 2, maxPlayers: 2 });
    b.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena-migrate", requiredPlayers: 2, maxPlayers: 2 });
    await a.waitFor(Opcode.MATCH_FOUND, 5000);
    await b.waitFor(Opcode.MATCH_FOUND, 5000);
    await a.waitFor(Opcode.ROOM_JOINED, 5000);
    await b.waitFor(Opcode.ROOM_JOINED, 5000);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const internal = (server as unknown as { internal: { players: Map<string, { id: string; roomId?: string }>; roomManager: { getAllRooms: () => Array<{ id: string; players: Map<string, unknown> }> } } }).internal;
    const rooms = internal.roomManager.getAllRooms();
    for (const player of internal.players.values()) {
      let membershipCount = 0;
      for (const room of rooms) {
        if (room.players.has(player.id)) {
          membershipCount += 1;
        }
      }
      assert.equal(membershipCount, 1, `player ${player.id} exists in ${membershipCount} rooms`);
      assert.ok(player.roomId, `player ${player.id} missing roomId`);
      const assigned = rooms.find((room) => room.id === player.roomId);
      assert.ok(assigned, `roomId ${player.roomId} not found for player ${player.id}`);
      assert.equal(assigned?.players.has(player.id), true);
    }
  } finally {
    await Promise.all([a?.close(), b?.close()].filter(Boolean) as Array<Promise<void>>);
    if (started) {
      await server.stop();
    }
  }
});
