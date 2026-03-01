import { Player } from "../player/player";
import { PluginSystem } from "../plugins/plugin-system";
import { Opcode } from "../types/opcode";

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
    this.pluginSystem.onPlayerJoin(this, player);
    this.onPlayerJoin(player);
    this.broadcast(Opcode.ROOM_PLAYER_JOIN, { roomId: this.id, playerId: player.id });
    return true;
  }

  public queueRemovePlayer(playerId: string): void {
    if (this.players.has(playerId)) {
      this.pendingRemovals.add(playerId);
    }
  }

  public processPendingRemovals(): void {
    for (const playerId of this.pendingRemovals) {
      const player = this.players.get(playerId);
      if (!player) {
        continue;
      }
      player.active = false;
      this.players.delete(playerId);
      this.pluginSystem.onPlayerLeave(this, player);
      this.onPlayerLeave(player);
      this.broadcast(Opcode.ROOM_PLAYER_LEAVE, { roomId: this.id, playerId: player.id });
    }
    this.pendingRemovals.clear();
  }

  public send(player: Player, opcode: Opcode, payload: Record<string, unknown>): void {
    this.sendContext.sendToSession(player.sessionId, opcode, payload);
  }

  public broadcast(opcode: Opcode, payload: Record<string, unknown>): void {
    for (const player of this.players.values()) {
      this.send(player, opcode, payload);
    }
  }

  public destroy(): void {
    if (this.state === "destroyed") {
      return;
    }
    this.state = "closing";
    this.processPendingRemovals();
    for (const player of this.players.values()) {
      this.pluginSystem.onPlayerLeave(this, player);
      this.onPlayerLeave(player);
    }
    this.players.clear();
    this.onDestroy();
    this.state = "destroyed";
    this.pluginSystem.onRoomDestroy(this);
  }
}
