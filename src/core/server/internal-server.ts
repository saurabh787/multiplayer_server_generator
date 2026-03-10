import { randomUUID } from "node:crypto";
import { createWriteStream, WriteStream } from "node:fs";
import path from "node:path";
import { RealtimeEngine } from "../engine/realtime-engine";
import { SlowTickEvent } from "../engine/realtime-engine";
import { TurnEngine } from "../engine/turn-engine";
import { Matchmaker } from "../matchmaking/matchmaker";
import { createPlayer, Player } from "../player/player";
import { Session } from "../player/session";
import { LoggerPlugin } from "../plugins/logger-plugin";
import { PluginSystem } from "../plugins/plugin-system";
import { Plugin } from "../plugins/types";
import { BaseRoom } from "../room/base-room";
import { RealtimeRoom } from "../room/realtime-room";
import { RoomManager } from "../room/room-manager";
import { PublicRealtimeRoomHost, PublicTurnRoomHost } from "../room/public-room-runtime";
import { SampleRealtimeRoom } from "../room/sample-realtime-room";
import { SampleTurnRoom } from "../room/sample-turn-room";
import { TurnRoom } from "../room/turn-room";
import { InternalRoom } from "../room/internal-room";
import { allowWithinRate } from "./rate-limiter";
import { RuntimeMetrics } from "./runtime-metrics";
import { WebSocketTransport } from "../transport/websocket-transport";
import { RuntimeTransport } from "../transport/types";
import { DEFAULT_CONFIG, ServerConfig } from "../../types/config";
import { ErrorCode } from "../../types/error-codes";
import { Opcode } from "../../types/opcode";
import { RoomConstructor, RoomOptions } from "../../public/types";
import {
  AuthPayload,
  InputPayload,
  MatchJoinPayload,
  RoomJoinPayload,
  TurnActionPayload
} from "../../types/packets";

export interface RoomFactoryInput {
  id: string;
  roomType: string;
  maxPlayers: number;
  pluginSystem: PluginSystem;
  sendToSession: (sessionId: string, opcode: Opcode, payload: Record<string, unknown>) => void;
}

export interface GameServerOptions {
  config?: Partial<ServerConfig>;
  transport?: RuntimeTransport;
  createRealtimeRoom?: (input: RoomFactoryInput) => RealtimeRoom;
  createTurnRoom?: (input: RoomFactoryInput) => TurnRoom;
  onRealtimeTickMeasured?: (durationMs: number) => void;
  onSlowTick?: (event: SlowTickEvent) => void;
}

interface RegisteredRoomDefinition {
  roomClass: RoomConstructor;
  options?: RoomOptions;
}

export class GameServer {
  private readonly config: ServerConfig;
  private readonly sessions = new Map<string, Session>();
  private readonly players = new Map<string, Player>();
  private readonly roomManager = new RoomManager();
  private readonly matchmaker = new Matchmaker();
  private readonly pluginSystem: PluginSystem;
  private readonly runtimeMetrics = new RuntimeMetrics();
  private readonly createRealtimeRoom: (input: RoomFactoryInput) => RealtimeRoom;
  private readonly createTurnRoom: (input: RoomFactoryInput) => TurnRoom;
  private readonly turnEngines = new Map<string, TurnEngine>();
  private readonly realtimeEngines = new Map<string, RealtimeEngine>();
  private readonly playerIdByToken = new Map<string, string>();
  private readonly pendingReconnectByToken = new Map<string, { playerId: string; timer: NodeJS.Timeout }>();
  private readonly reconnectTokenByPlayerId = new Map<string, string>();
  private readonly transport: RuntimeTransport;
  private readonly roomRegistry = new Map<string, RegisteredRoomDefinition>();
  private readonly autoDisposeByRoomId = new Map<string, boolean>();
  private readonly onRealtimeTickMeasured?: (durationMs: number) => void;
  private readonly onSlowTick?: (event: SlowTickEvent) => void;
  private readonly slowTickLogStream: WriteStream;

  public constructor(options: GameServerOptions = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.pluginSystem = new PluginSystem([new LoggerPlugin()]);
    this.createRealtimeRoom =
      options.createRealtimeRoom ??
      ((input) =>
        new SampleRealtimeRoom(input.id, input.roomType, input.maxPlayers, input.pluginSystem, {
          sendToSession: input.sendToSession
        }));
    this.createTurnRoom =
      options.createTurnRoom ??
      ((input) =>
        new SampleTurnRoom(input.id, input.roomType, input.maxPlayers, input.pluginSystem, {
          sendToSession: input.sendToSession
        }));
    this.onRealtimeTickMeasured = options.onRealtimeTickMeasured;
    this.onSlowTick = options.onSlowTick;
    this.slowTickLogStream = createWriteStream(path.join(process.cwd(), "slow-ticks.log"), { flags: "a" });
    this.slowTickLogStream.on("error", (error) => {
      // eslint-disable-next-line no-console
      console.error(`[slow-ticks] stream error: ${(error as Error).message}`);
    });

    const events = {
      onConnect: (session: Session) => this.onConnect(session),
      onPacket: (session: Session, opcode: number, payload: Record<string, unknown>) => this.onPacket(session, opcode, payload),
      onDisconnect: (session: Session) => this.onDisconnect(session)
    };

    this.transport = options.transport ?? new WebSocketTransport(this.config, events, () => this.metrics());
    this.transport.setBindings?.(this.config, events, () => this.metrics());
  }

  public async listen(): Promise<void> {
    await this.transport.listen();
    this.pluginSystem.onServerStart();
  }

  public async shutdown(): Promise<void> {
    for (const pending of this.pendingReconnectByToken.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingReconnectByToken.clear();
    for (const engine of this.realtimeEngines.values()) {
      engine.stop();
    }
    this.realtimeEngines.clear();
    this.turnEngines.clear();
    this.roomManager.clear();
    await this.transport.close();
    this.pluginSystem.onServerStop();
    await new Promise<void>((resolve) => {
      this.slowTickLogStream.end(() => resolve());
    });
  }

  public metrics(): Record<string, unknown> {
    return {
      sessions: this.sessions.size,
      players: this.players.size,
      rooms: this.roomManager.getAllRooms().length,
      ...this.runtimeMetrics.snapshot()
    };
  }

  public use(plugin: Plugin): void {
    this.pluginSystem.add(plugin);
  }

  public registerRoom<TState>(
    name: string,
    roomClass: RoomConstructor<TState>,
    options?: RoomOptions
  ): void {
    this.roomRegistry.set(name, { roomClass: roomClass as RoomConstructor, options });
  }

  public disconnectPlayer(playerId: string, _reason?: string): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    this.transport.disconnect(player.sessionId);
  }

  public sendPlayerMessage(playerId: string, type: string, payload: unknown): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    this.transport.send(player.sessionId, Opcode.ROOM_MESSAGE, { type, payload });
  }

  private onConnect(session: Session): void {
    this.sessions.set(session.id, session);
    this.runtimeMetrics.onConnect();
    this.pluginSystem.onConnect(session);
  }

  private onDisconnect(session: Session): void {
    this.runtimeMetrics.onDisconnect(session.isAuthenticated);
    this.sessions.delete(session.id);
    if (!session.playerId) {
      return;
    }
    const player = this.players.get(session.playerId);
    if (!player) {
      return;
    }
    const reconnectToken = this.reconnectTokenByPlayerId.get(player.id);
    if (reconnectToken) {
      player.active = false;
      const timer = setTimeout(() => {
        this.finalizePlayerDisconnect(player.id);
      }, this.config.reconnectGraceMs);
      this.pendingReconnectByToken.set(reconnectToken, { playerId: player.id, timer });
      return;
    }
    this.finalizePlayerDisconnect(player.id);
  }

  private onPacket(session: Session, opcode: number, payload: Record<string, unknown>): void {
    if (opcode === Opcode.PONG) {
      session.lastPing = Date.now();
      return;
    }

    if (opcode !== Opcode.AUTH && !session.isAuthenticated) {
      this.sendError(session.id, ErrorCode.NOT_AUTHENTICATED, "Authenticate first");
      return;
    }

    try {
      switch (opcode) {
        case Opcode.AUTH:
          this.handleAuth(session, payload as unknown as AuthPayload);
          return;
        case Opcode.MATCH_JOIN:
          this.handleMatchJoin(session, payload as unknown as MatchJoinPayload);
          return;
        case Opcode.MATCH_CANCEL:
          this.handleMatchCancel(session);
          return;
        case Opcode.ROOM_JOIN:
          this.handleRoomJoin(session, payload as unknown as RoomJoinPayload);
          return;
        case Opcode.ROOM_LEAVE:
          this.handleRoomLeave(session);
          return;
        case Opcode.INPUT:
          this.handleInput(session, payload as unknown as InputPayload);
          return;
        case Opcode.TURN_ACTION:
          this.handleTurnAction(session, payload as unknown as TurnActionPayload);
          return;
        case Opcode.PING:
          this.transport.send(session.id, Opcode.PONG, { ts: Date.now() });
          return;
        default:
          this.sendError(session.id, ErrorCode.UNKNOWN_OPCODE, "Unhandled opcode");
          return;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[server:onPacket]", error);
      this.sendError(session.id, ErrorCode.INVALID_PACKET, "Packet handling failed");
      return;
    }
  }

  private handleAuth(session: Session, payload: AuthPayload): void {
    if (payload.protocolVersion !== this.config.protocolVersion) {
      this.sendError(session.id, ErrorCode.INVALID_PACKET, "Unsupported protocol version");
      this.transport.disconnect(session.id);
      return;
    }
    session.isAuthenticated = true;
    session.protocolVersion = payload.protocolVersion;

    if (payload.token) {
      const pending = this.pendingReconnectByToken.get(payload.token);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingReconnectByToken.delete(payload.token);
        const existing = this.players.get(pending.playerId);
        if (existing) {
          existing.sessionId = session.id;
          existing.active = true;
          session.playerId = existing.id;
          session.roomId = existing.roomId;
          this.reconnectTokenByPlayerId.set(existing.id, payload.token);
          this.playerIdByToken.set(payload.token, existing.id);
          this.pluginSystem.onAuth(session);
          this.runtimeMetrics.onAuthSuccess();
          this.transport.send(session.id, Opcode.AUTH_OK, {
            sessionId: session.id,
            playerId: existing.id,
            reconnected: true,
            roomId: existing.roomId
          });
          return;
        }
      }
    }

    const player = createPlayer(randomUUID(), session.id);
    session.playerId = player.id;
    this.players.set(player.id, player);
    if (payload.token) {
      this.playerIdByToken.set(payload.token, player.id);
      this.reconnectTokenByPlayerId.set(player.id, payload.token);
    }
    this.pluginSystem.onAuth(session);
    this.runtimeMetrics.onAuthSuccess();
    this.transport.send(session.id, Opcode.AUTH_OK, {
      sessionId: session.id,
      playerId: player.id
    });
  }

  private handleMatchJoin(session: Session, payload: MatchJoinPayload): void {
    if (!session.playerId) {
      return;
    }
    const player = this.players.get(session.playerId);
    if (!player) {
      return;
    }
    this.detachPlayerFromCurrentRoom(player);

    const registered = this.roomRegistry.get(payload.roomType);
    const requestedMode = payload.mode ?? registered?.options?.engine ?? "realtime";
    const requiredPlayers = payload.requiredPlayers ?? 2;
    const maxPlayers = payload.maxPlayers ?? requiredPlayers;
    const matched = this.matchmaker.enqueue({
      player,
      mode: requestedMode,
      roomType: payload.roomType,
      requiredPlayers,
      maxPlayers
    });

    if (!matched) {
      return;
    }

    const roomId = randomUUID();
    const room = this.createRoom(matched.mode, roomId, matched.roomType, matched.maxPlayers);
    for (const matchedPlayer of matched.players) {
      this.detachPlayerFromCurrentRoom(matchedPlayer);
      const joined = room.addPlayer(matchedPlayer);
      if (!joined) {
        this.sendError(matchedPlayer.sessionId, ErrorCode.ROOM_FULL, "Unable to join room");
        continue;
      }
      this.assertSingleRoom(matchedPlayer.id, "match_join");
      this.runtimeMetrics.onRoomJoin();
      const playerSession = this.sessions.get(matchedPlayer.sessionId);
      if (playerSession) {
        playerSession.roomId = room.id;
      }
      this.transport.send(matchedPlayer.sessionId, Opcode.MATCH_FOUND, {
        roomId: room.id,
        roomType: room.roomType,
        mode: room.type
      });
      this.transport.send(matchedPlayer.sessionId, Opcode.ROOM_JOINED, {
        roomId: room.id,
        roomType: room.roomType,
        mode: room.type
      });
    }
    if (room.players.size > 0) {
      room.start();
    } else {
      this.destroyRoom(room.id);
    }
  }

  private handleMatchCancel(session: Session): void {
    if (!session.playerId) {
      return;
    }
    this.matchmaker.cancel(session.playerId);
  }

  private handleRoomJoin(session: Session, payload: RoomJoinPayload): void {
    if (!session.playerId) {
      return;
    }
    const room = this.roomManager.getRoom(payload.roomId);
    if (!room) {
      this.sendError(session.id, ErrorCode.ROOM_NOT_FOUND, "Room not found");
      return;
    }
    const player = this.players.get(session.playerId);
    if (!player) {
      return;
    }
    if (player.roomId && player.roomId !== room.id) {
      this.detachPlayerFromCurrentRoom(player);
    }
    if (!room.addPlayer(player)) {
      this.sendError(session.id, ErrorCode.ROOM_FULL, "Room full");
      return;
    }
    this.assertSingleRoom(player.id, "room_join");
    this.runtimeMetrics.onRoomJoin();
    session.roomId = room.id;
    this.transport.send(session.id, Opcode.ROOM_JOINED, {
      roomId: room.id,
      roomType: room.roomType,
      mode: room.type
    });
  }

  private handleRoomLeave(session: Session): void {
    if (!session.playerId) {
      return;
    }
    const player = this.players.get(session.playerId);
    if (!player?.roomId) {
      return;
    }
    this.detachPlayerFromCurrentRoom(player);
  }

  private handleInput(session: Session, payload: InputPayload): void {
    if (!session.playerId) {
      return;
    }
    const player = this.players.get(session.playerId);
    if (!player || !player.roomId) {
      return;
    }
    const room = this.roomManager.getRoom(player.roomId);
    if (!(room instanceof RealtimeRoom)) {
      return;
    }
    if (
      !allowWithinRate(player.inputCountWindow, Date.now(), this.config.maxInputsPerSecond)
    ) {
      return;
    }
    if (player.inputBuffer.length >= this.config.maxInputBufferPerPlayer) {
      player.inputBuffer.shift();
    }
    const input = {
      tick: payload.tick,
      ...payload.input
    };
    this.runtimeMetrics.onInput();
    this.pluginSystem.onInput(room, player, input);
    this.safeRoomInvoke(room, "onInput", () => room.onInput(player, input));
  }

  private handleTurnAction(session: Session, payload: TurnActionPayload): void {
    if (!session.playerId) {
      return;
    }
    const player = this.players.get(session.playerId);
    if (!player?.roomId) {
      return;
    }
    const room = this.roomManager.getRoom(player.roomId);
    if (!(room instanceof TurnRoom)) {
      return;
    }
    const engine = this.turnEngines.get(room.id);
    if (!engine) {
      return;
    }
    const result = engine.processAction(player, {
      action: payload.action,
      data: payload.data
    });
    if (!result.ok) {
      this.sendError(session.id, result.code, result.message);
    }
  }

  private createRoom(mode: "realtime" | "turn", roomId: string, roomType: string, maxPlayers: number): InternalRoom {
    const registered = this.roomRegistry.get(roomType);
    const options = registered?.options;
    const resolvedMode = options?.engine ?? mode;
    const resolvedMaxPlayers = options?.maxClients ?? maxPlayers;
    const common = {
      id: roomId,
      roomType,
      maxPlayers: resolvedMaxPlayers,
      pluginSystem: this.pluginSystem,
      sendToSession: (sessionId: string, opcode: Opcode, payload: Record<string, unknown>) =>
        this.transport.send(sessionId, opcode, payload)
    };

    if (registered) {
      if (resolvedMode === "turn") {
        const room = new PublicTurnRoomHost(
          common.id,
          common.roomType,
          common.maxPlayers,
          common.pluginSystem,
          { sendToSession: common.sendToSession },
          registered.roomClass,
          {
            disconnectPlayer: (playerId, reason) => this.disconnectPlayer(playerId, reason)
          },
          options
        );
        const engine = new TurnEngine();
        room.attachEngine(engine);
        this.turnEngines.set(room.id, engine);
        this.autoDisposeByRoomId.set(room.id, options?.autoDispose ?? true);
        this.roomManager.createRoom(room);
        this.runtimeMetrics.onRoomCreated();
        this.pluginSystem.onRoomCreate(room);
        this.safeRoomInvoke(room, "onInit", () => room.onInit());
        return room;
      }
      const room = new PublicRealtimeRoomHost(
        common.id,
        common.roomType,
        common.maxPlayers,
        common.pluginSystem,
        { sendToSession: common.sendToSession },
        registered.roomClass,
        {
          disconnectPlayer: (playerId, reason) => this.disconnectPlayer(playerId, reason)
        },
        options
      );
      const engine = new RealtimeEngine(this.pluginSystem, {
        tickRate: options?.tickRate ?? this.config.realtimeTickRate,
        slowTickThresholdMs: this.config.slowTickThresholdMs,
        onTickMeasured: this.onRealtimeTickMeasured,
        onSnapshotEmitted: () => this.runtimeMetrics.onSnapshot(),
        onSlowTick: (event) => {
          const line = JSON.stringify({ type: "slow_tick", ...event });
          this.slowTickLogStream.write(`${line}\n`);
          this.onSlowTick?.(event);
        }
      });
      room.attachEngine(engine);
      this.realtimeEngines.set(room.id, engine);
      this.autoDisposeByRoomId.set(room.id, options?.autoDispose ?? true);
      this.roomManager.createRoom(room);
      this.runtimeMetrics.onRoomCreated();
      this.pluginSystem.onRoomCreate(room);
      this.safeRoomInvoke(room, "onInit", () => room.onInit());
      return room;
    }

    if (resolvedMode === "realtime") {
      const room = this.createRealtimeRoom(common);
      const engine = new RealtimeEngine(this.pluginSystem, {
        tickRate: options?.tickRate ?? this.config.realtimeTickRate,
        slowTickThresholdMs: this.config.slowTickThresholdMs,
        onTickMeasured: this.onRealtimeTickMeasured,
        onSnapshotEmitted: () => this.runtimeMetrics.onSnapshot(),
        onSlowTick: (event) => {
          const line = JSON.stringify({ type: "slow_tick", ...event });
          this.slowTickLogStream.write(`${line}\n`);
          this.onSlowTick?.(event);
        }
      });
      room.attachEngine(engine);
      this.realtimeEngines.set(room.id, engine);
      this.autoDisposeByRoomId.set(room.id, options?.autoDispose ?? true);
      this.roomManager.createRoom(room);
      this.runtimeMetrics.onRoomCreated();
      this.pluginSystem.onRoomCreate(room);
      this.safeRoomInvoke(room, "onInit", () => room.onInit());
      return room;
    }

    const room = this.createTurnRoom(common);
    const engine = new TurnEngine();
    room.attachEngine(engine);
    this.turnEngines.set(room.id, engine);
    this.autoDisposeByRoomId.set(room.id, options?.autoDispose ?? true);
    this.roomManager.createRoom(room);
    this.runtimeMetrics.onRoomCreated();
    this.pluginSystem.onRoomCreate(room);
    this.safeRoomInvoke(room, "onInit", () => room.onInit());
    return room;
  }

  private destroyRoom(roomId: string): void {
    if (!this.roomManager.getRoom(roomId)) {
      return;
    }
    const realtimeEngine = this.realtimeEngines.get(roomId);
    realtimeEngine?.stop();
    this.runtimeMetrics.onRoomDestroyed();
    this.realtimeEngines.delete(roomId);
    this.turnEngines.delete(roomId);
    this.autoDisposeByRoomId.delete(roomId);
    this.roomManager.removeRoom(roomId);
  }

  private sendError(sessionId: string, code: ErrorCode, message: string): void {
    this.transport.send(sessionId, Opcode.ERROR, { code, message });
  }

  private finalizePlayerDisconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    this.matchmaker.cancel(player.id);
    this.detachPlayerFromCurrentRoom(player);
    const token = this.reconnectTokenByPlayerId.get(player.id);
    if (token) {
      this.pendingReconnectByToken.delete(token);
      this.playerIdByToken.delete(token);
      this.reconnectTokenByPlayerId.delete(player.id);
    }
    this.players.delete(player.id);
  }

  private safeRoomInvoke(room: BaseRoom, context: string, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[room:${room.id}:${context}]`, error);
      this.pluginSystem.onRoomError(room, context, error);
      this.destroyRoom(room.id);
    }
  }

  private shouldAutoDispose(roomId: string): boolean {
    return this.autoDisposeByRoomId.get(roomId) ?? true;
  }

  private detachPlayerFromCurrentRoom(player: Player): void {
    const currentRoomId = player.roomId;
    if (!currentRoomId) {
      return;
    }

    const room = this.roomManager.getRoom(currentRoomId);
    const session = this.sessions.get(player.sessionId);
    if (!room) {
      if (session?.roomId === currentRoomId) {
        session.roomId = undefined;
      }
      player.roomId = undefined;
      return;
    }

    const hadMembership = room.players.has(player.id);
    if (hadMembership) {
      room.queueRemovePlayer(player.id);
      room.processPendingRemovals();
      if (!room.players.has(player.id)) {
        this.runtimeMetrics.onRoomLeave();
      }
    }

    if (session?.roomId === currentRoomId) {
      session.roomId = undefined;
    }
    if (player.roomId === currentRoomId) {
      player.roomId = undefined;
    }

    if (room.players.size === 0 && this.shouldAutoDispose(room.id)) {
      this.destroyRoom(room.id);
    }
  }

  private assertSingleRoom(playerId: string, context: string): void {
    let count = 0;
    const rooms: string[] = [];
    for (const room of this.roomManager.getAllRooms()) {
      if (room.players.has(playerId)) {
        count += 1;
        rooms.push(room.id);
      }
    }
    if (count <= 1) {
      return;
    }
    // eslint-disable-next-line no-console
    console.error(`[membership:${context}] player in multiple rooms`, {
      playerId,
      count,
      rooms
    });
  }
}
