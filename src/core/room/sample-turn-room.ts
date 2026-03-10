import { Player } from "../player/player";
import { PluginSystem } from "../plugins/plugin-system";
import { RoomSendContext } from "./base-room";
import { TurnRoom } from "./turn-room";

export class SampleTurnRoom extends TurnRoom {
  private turnCount = 0;
  private readonly actions: Array<{ playerId: string; action: number }> = [];

  public constructor(
    id: string,
    roomType: string,
    maxPlayers: number,
    pluginSystem: PluginSystem,
    sendContext: RoomSendContext
  ) {
    super(id, roomType, maxPlayers, pluginSystem, sendContext);
  }

  public onTurn(player: Player, action: { action: number }): Record<string, unknown> {
    this.turnCount += 1;
    this.actions.push({ playerId: player.id, action: action.action });
    return this.getState();
  }

  public getState(): Record<string, unknown> {
    return {
      turnCount: this.turnCount,
      actions: this.actions
    };
  }
}
