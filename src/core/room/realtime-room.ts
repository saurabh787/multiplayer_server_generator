import { Player } from "../player/player";
import { PluginSystem } from "../plugins/plugin-system";
import { Opcode } from "../../types/opcode";
import { RoomSendContext } from "./base-room";
import { InternalRoom } from "./internal-room";
import { buildSnapshot } from "./snapshot-builder";

export abstract class RealtimeRoom extends InternalRoom {
  private tickCount = 0;

  protected constructor(
    id: string,
    roomType: string,
    maxPlayers: number,
    pluginSystem: PluginSystem,
    sendContext: RoomSendContext
  ) {
    super(id, roomType, "realtime", maxPlayers, pluginSystem, sendContext);
  }

  public abstract onTick(deltaMs: number): void;
  public abstract getSnapshot(): Record<string, unknown>;

  public runRealtimeStep(deltaMs: number): Record<string, unknown> {
    this.onTick(deltaMs);
    return this.getSnapshot();
  }

  public tick(deltaMs: number): void {
    this.pluginSystem.beforeSnapshot(this);
    const snapshot = this.runRealtimeStep(deltaMs);
    this.tickCount += 1;
    this.broadcast(Opcode.SNAPSHOT, buildSnapshot(this.tickCount, this.id, snapshot));
    this.pluginSystem.afterSnapshot(this, snapshot);
    for (const player of this.players.values()) {
      player.inputBuffer = [];
    }
    this.processPendingRemovals();
  }

  public onInit(): void {}
  public onPlayerJoin(_player: Player): void {}
  public onPlayerLeave(_player: Player): void {}
  public onInput(player: Player, input: Record<string, unknown>): void {
    player.inputBuffer.push(input);
  }
}
