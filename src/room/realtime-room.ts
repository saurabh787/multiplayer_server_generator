import { RealtimeEngine } from "../engine/realtime-engine";
import { Player } from "../player/player";
import { PluginSystem } from "../plugins/plugin-system";
import { RoomSendContext } from "./base-room";
import { BaseRoom } from "./base-room";

export abstract class RealtimeRoom extends BaseRoom {
  private engine?: RealtimeEngine;

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

  public attachEngine(engine: RealtimeEngine): void {
    this.engine = engine;
  }

  public start(): void {
    this.engine?.start();
  }

  public stop(): void {
    this.engine?.stop();
  }

  public onInit(): void {}
  public onPlayerJoin(_player: Player): void {}
  public onPlayerLeave(_player: Player): void {}
  public onInput(player: Player, input: Record<string, unknown>): void {
    player.inputBuffer.push(input);
  }
  public onDestroy(): void {
    this.stop();
  }
}
