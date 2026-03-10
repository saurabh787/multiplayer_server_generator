import { Engine } from "../engine/engine";
import { PluginSystem } from "../plugins/plugin-system";
import { RoomMode, RoomSendContext } from "./base-room";
import { BaseRoom } from "./base-room";

export abstract class InternalRoom extends BaseRoom {
  private engine?: Engine<this>;
  private started = false;

  protected constructor(
    id: string,
    roomType: string,
    type: RoomMode,
    maxPlayers: number,
    pluginSystem: PluginSystem,
    sendContext: RoomSendContext
  ) {
    super(id, roomType, type, maxPlayers, pluginSystem, sendContext);
  }

  public attachEngine(engine: Engine<this>): void {
    this.engine = engine;
    engine.attachRoom(this);
  }

  public start(): void {
    if (this.state !== "active" || this.started) {
      return;
    }
    this.started = true;
    this.engine?.start();
  }

  public stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.engine?.stop();
  }

  public onDestroy(): void {
    this.stop();
    this.onInternalDestroy();
  }

  public tick(_deltaMs: number): void {}

  protected onInternalDestroy(): void {}
}
