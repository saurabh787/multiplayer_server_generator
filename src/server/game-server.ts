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
import { BaseRoom } from "../room/base-room";
import { RealtimeRoom } from "../room/realtime-room";
import { RoomManager } from "../room/room-manager";
import { SampleRealtimeRoom } from "../room/sample-realtime-room";
import { SampleTurnRoom } from "../room/sample-turn-room";
import { TurnRoom } from "../room/turn-room";
import { allowWithinRate } from "./rate-limiter";
import { RuntimeMetrics } from "./runtime-metrics";
import { WebSocketTransport } from "../transport/websocket-transport";
import { DEFAULT_CONFIG, ServerConfig } from "../types/config";
import { ErrorCode } from "../types/error-codes";
import { Opcode } from "../types/opcode";
import {
  AuthPayload,
  InputPayload,
  MatchJoinPayload,
  RoomJoinPayload,
  TurnActionPayload
} from "../types/packets";

export interface RoomFactoryInput {
  id: string;
  roomType: string;
  maxPlayers: number;
  pluginSystem: PluginSystem;
  sendToSession: (sessionId: string, opcode: Opcode, payload: Record<string, unknown>) => void;
}

export interface GameServerOptions {
  config?: Partial<ServerConfig>;
  createRealtimeRoom?: (input: RoomFactoryInput) => RealtimeRoom;
  createTurnRoom?: (input: RoomFactoryInput) => TurnRoom;
  onRealtimeTickMeasured?: (durationMs: number) => void;
  onSlowTick?: (event: SlowTickEvent) => void;
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
  private readonly transport: WebSocketTransport;
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

    this.transport = new WebSocketTransport(
      this.config,
      {
        onConnect: (session) => this.onConnect(session),
        onPacket: (session, opcode, payload) => this.onPacket(session, opcode, payload),
        onDisconnect: (session) => this.onDisconnect(session)
      },
      () => this.metrics()
    );
  }

  public async listen(): Promise<void> {
    await this.transport.listen();
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
  }

  private handleAuth(session: Session, payload: AuthPayload): void {
    if (payload.protocolVersion !== this.config.protocolVersion) {
      this.sendError(session.id, ErrorCode.INVALID_PACKET, "Unsupported protocol version");
      session.socket.close();
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

    const requiredPlayers = payload.requiredPlayers ?? 2;
    const maxPlayers = payload.maxPlayers ?? requiredPlayers;
    const matched = this.matchmaker.enqueue({
      player,
      mode: payload.mode,
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
      const joined = room.addPlayer(matchedPlayer);
      if (joined) {
        this.runtimeMetrics.onRoomJoin();
      }
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
    if (room instanceof RealtimeRoom) {
      room.start();
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
    if (!room.addPlayer(player)) {
      this.sendError(session.id, ErrorCode.ROOM_FULL, "Room full");
      return;
    }
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
    const room = this.roomManager.getRoom(player.roomId);
    room?.queueRemovePlayer(player.id);
    room?.processPendingRemovals();
    this.runtimeMetrics.onRoomLeave();
    session.roomId = undefined;
    player.roomId = undefined;
    if (room && room.players.size === 0) {
      this.destroyRoom(room.id);
    }
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
    room.onInput(player, input);
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

  private createRoom(mode: "realtime" | "turn", roomId: string, roomType: string, maxPlayers: number): BaseRoom {
    const common = {
      id: roomId,
      roomType,
      maxPlayers,
      pluginSystem: this.pluginSystem,
      sendToSession: (sessionId: string, opcode: Opcode, payload: Record<string, unknown>) =>
        this.transport.send(sessionId, opcode, payload)
    };

    if (mode === "realtime") {
      const room = this.createRealtimeRoom(common);
      const engine = new RealtimeEngine(room, this.pluginSystem, {
        tickRate: this.config.realtimeTickRate,
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
      this.roomManager.createRoom(room);
      this.runtimeMetrics.onRoomCreated();
      this.pluginSystem.onRoomCreate(room);
      room.onInit();
      return room;
    }

    const room = this.createTurnRoom(common);
    const engine = new TurnEngine(room);
    this.turnEngines.set(room.id, engine);
    this.roomManager.createRoom(room);
    this.runtimeMetrics.onRoomCreated();
    this.pluginSystem.onRoomCreate(room);
    room.onInit();
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
    if (player.roomId) {
      const room = this.roomManager.getRoom(player.roomId);
      room?.queueRemovePlayer(player.id);
      room?.processPendingRemovals();
      this.runtimeMetrics.onRoomLeave();
      if (room && room.players.size === 0) {
        this.destroyRoom(room.id);
      }
    }
    const token = this.reconnectTokenByPlayerId.get(player.id);
    if (token) {
      this.pendingReconnectByToken.delete(token);
      this.playerIdByToken.delete(token);
      this.reconnectTokenByPlayerId.delete(player.id);
    }
    this.players.delete(player.id);
  }
}
