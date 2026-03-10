import { Player } from "../player/player";
import { PluginSystem } from "../plugins/plugin-system";
import { Opcode } from "../../types/opcode";

export type RoomMode = "realtime" | "turn";
export type RoomState = "active" | "closing" | "destroyed";

export interface RoomSendContext {
  sendToSession: (sessionId: string, opcode: Opcode, payload: Record<string, unknown>) => void;
}

export abstract class BaseRoom {
  public readonly id: string;
  public readonly roomType: string;
  public readonly type: RoomMode;
  public readonly maxPlayers: number;
  public readonly players: Map<string, Player>;
  public readonly pendingRemovals: Set<string>;
  public state: RoomState;
  protected readonly pluginSystem: PluginSystem;
  protected readonly sendContext: RoomSendContext;

  protected constructor(
    id: string,
    roomType: string,
    type: RoomMode,
    maxPlayers: number,
    pluginSystem: PluginSystem,
    sendContext: RoomSendContext
  ) {
    this.id = id;
    this.roomType = roomType;
    this.type = type;
    this.maxPlayers = maxPlayers;
    this.pluginSystem = pluginSystem;
    this.sendContext = sendContext;
    this.players = new Map<string, Player>();
    this.pendingRemovals = new Set<string>();
    this.state = "active";
  }

  public abstract onInit(): void;
  public abstract onPlayerJoin(player: Player): void;
  public abstract onPlayerLeave(player: Player): void;
  public abstract onInput(player: Player, input: Record<string, unknown>): void;
  public abstract onDestroy(): void;

  public addPlayer(player: Player): boolean {
    if (this.state !== "active") {
      return false;
    }
    if (this.players.size >= this.maxPlayers) {
      return false;
    }
    player.roomId = this.id;
    this.players.set(player.id, player);
    if (
      !this.safeInvoke("onPlayerJoin", () => {
        this.pluginSystem.onPlayerJoin(this, player);
        this.onPlayerJoin(player);
        this.broadcast(Opcode.ROOM_PLAYER_JOIN, { roomId: this.id, playerId: player.id });
      })
    ) {
      return false;
    }
    return true;
  }

  public queueRemovePlayer(playerId: string): void {
    if (this.state !== "active") {
      return;
    }
    if (this.players.has(playerId)) {
      this.pendingRemovals.add(playerId);
    }
  }

  public processPendingRemovals(): void {
    if (this.state === "destroyed") {
      this.pendingRemovals.clear();
      return;
    }
    for (const playerId of this.pendingRemovals) {
      const player = this.players.get(playerId);
      if (!player) {
        continue;
      }
      player.active = false;
      player.roomId = undefined;
      this.players.delete(playerId);
      this.pluginSystem.onPlayerLeave(this, player);
      if (
        !this.safeInvoke("onPlayerLeave", () => {
          this.onPlayerLeave(player);
          this.broadcast(Opcode.ROOM_PLAYER_LEAVE, { roomId: this.id, playerId: player.id });
        })
      ) {
        break;
      }
    }
    this.pendingRemovals.clear();
  }

  public send(player: Player, opcode: Opcode, payload: Record<string, unknown>): void {
    if (this.state === "destroyed") {
      return;
    }
    this.sendContext.sendToSession(player.sessionId, opcode, payload);
  }

  public broadcast(opcode: Opcode, payload: Record<string, unknown>): void {
    for (const player of this.players.values()) {
      this.send(player, opcode, payload);
    }
  }

  public destroy(): void {
    if (this.state !== "active") {
      return;
    }
    this.state = "closing";
    this.processPendingRemovals();
    for (const player of this.players.values()) {
      player.active = false;
      player.roomId = undefined;
      this.pluginSystem.onPlayerLeave(this, player);
      this.safeInvoke("onPlayerLeave", () => this.onPlayerLeave(player));
    }
    this.players.clear();
    this.pendingRemovals.clear();
    this.safeInvoke("onDestroy", () => this.onDestroy(), false);
    this.state = "destroyed";
    this.pluginSystem.onRoomDestroy(this);
  }

  protected safeInvoke(context: string, callback: () => void, destroyOnError = true): boolean {
    try {
      callback();
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[room:${this.id}:${context}]`, error);
      this.pluginSystem.onRoomError(this, context, error);
      if (destroyOnError) {
        this.destroy();
      }
      return false;
    }
  }
}
