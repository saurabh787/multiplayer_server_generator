import { Player } from "../player/player";
import { PluginSystem } from "../plugins/plugin-system";
import { RoomSendContext } from "./base-room";
import { RealtimeRoom } from "./realtime-room";

export class SampleRealtimeRoom extends RealtimeRoom {
  private tick = 0;
  private readonly positions = new Map<string, { x: number; y: number }>();

  public constructor(
    id: string,
    roomType: string,
    maxPlayers: number,
    pluginSystem: PluginSystem,
    sendContext: RoomSendContext
  ) {
    super(id, roomType, maxPlayers, pluginSystem, sendContext);
  }

  public override onPlayerJoin(player: Player): void {
    this.positions.set(player.id, { x: 0, y: 0 });
  }

  public override onPlayerLeave(player: Player): void {
    this.positions.delete(player.id);
  }

  public override onInput(player: Player, input: Record<string, unknown>): void {
    super.onInput(player, input);
    const pos = this.positions.get(player.id);
    if (!pos) {
      return;
    }
    const dx = typeof input.dx === "number" ? input.dx : 0;
    const dy = typeof input.dy === "number" ? input.dy : 0;
    pos.x += dx;
    pos.y += dy;
  }

  public onTick(_deltaMs: number): void {
    this.tick += 1;
  }

  public getSnapshot(): Record<string, unknown> {
    return {
      tick: this.tick,
      players: [...this.positions.entries()].map(([id, value]) => ({
        id,
        ...value
      }))
    };
  }
}
