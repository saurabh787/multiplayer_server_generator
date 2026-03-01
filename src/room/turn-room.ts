import { Player } from "../player/player";
import { PluginSystem } from "../plugins/plugin-system";
import { RoomSendContext } from "./base-room";
import { BaseRoom } from "./base-room";

export abstract class TurnRoom extends BaseRoom {
  public currentTurnPlayerId?: string;

  protected constructor(
    id: string,
    roomType: string,
    maxPlayers: number,
    pluginSystem: PluginSystem,
    sendContext: RoomSendContext
  ) {
    super(id, roomType, "turn", maxPlayers, pluginSystem, sendContext);
  }

  public abstract onTurn(player: Player, action: { action: number; data?: Record<string, unknown> }): Record<string, unknown>;
  public abstract getState(): Record<string, unknown>;

  public onInit(): void {}
  public onPlayerJoin(_player: Player): void {
    if (!this.currentTurnPlayerId) {
      this.currentTurnPlayerId = _player.id;
    }
  }
  public onPlayerLeave(_player: Player): void {
    if (this.currentTurnPlayerId === _player.id) {
      this.currentTurnPlayerId = this.players.keys().next().value as string | undefined;
    }
  }
  public onInput(_player: Player, _input: Record<string, unknown>): void {}
  public onDestroy(): void {}
}
