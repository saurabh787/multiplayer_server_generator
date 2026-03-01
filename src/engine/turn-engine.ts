import { Player } from "../player/player";
import { TurnRoom } from "../room/turn-room";
import { ErrorCode } from "../types/error-codes";
import { Opcode } from "../types/opcode";

export class TurnEngine {
  private readonly room: TurnRoom;

  public constructor(room: TurnRoom) {
    this.room = room;
  }

  public processAction(
    player: Player,
    action: { action: number; data?: Record<string, unknown> }
  ): { ok: true } | { ok: false; code: ErrorCode; message: string } {
    if (this.room.currentTurnPlayerId && this.room.currentTurnPlayerId !== player.id) {
      return {
        ok: false,
        code: ErrorCode.INVALID_TURN,
        message: "Not your turn"
      };
    }

    try {
      const state = this.room.onTurn(player, action);
      this.room.currentTurnPlayerId = this.nextTurnPlayerId(player.id);
      this.room.broadcast(Opcode.TURN_RESULT, {
        playerId: player.id,
        action: action.action,
        state
      });
      return { ok: true };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[turn-engine:${this.room.id}]`, error);
      this.room.destroy();
      return {
        ok: false,
        code: ErrorCode.INVALID_TURN,
        message: "Turn processing failed"
      };
    }
  }

  private nextTurnPlayerId(currentPlayerId: string): string | undefined {
    const ids = [...this.room.players.keys()];
    if (ids.length === 0) {
      return undefined;
    }
    const index = ids.indexOf(currentPlayerId);
    if (index === -1) {
      return ids[0];
    }
    return ids[(index + 1) % ids.length];
  }
}
