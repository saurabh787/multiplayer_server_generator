import { Player } from "../player/player";
import { TurnRoom } from "../room/turn-room";
import { ErrorCode } from "../../types/error-codes";
import { Opcode } from "../../types/opcode";
import { Engine } from "./engine";

export class TurnEngine implements Engine<TurnRoom> {
  private room?: TurnRoom;

  public constructor(room?: TurnRoom) {
    this.room = room;
  }

  public attachRoom(room: TurnRoom): void {
    this.room = room;
  }

  public start(): void {}

  public stop(): void {}

  private getRoom(): TurnRoom {
    if (!this.room) {
      throw new Error("TurnEngine room is not attached");
    }
    return this.room;
  }

  public processAction(
    player: Player,
    action: { action: number; data?: Record<string, unknown> }
  ): { ok: true } | { ok: false; code: ErrorCode; message: string } {
    const room = this.getRoom();
    if (room.currentTurnPlayerId && room.currentTurnPlayerId !== player.id) {
      return {
        ok: false,
        code: ErrorCode.INVALID_TURN,
        message: "Not your turn"
      };
    }

    try {
      const state = room.onTurn(player, action);
      room.currentTurnPlayerId = this.nextTurnPlayerId(player.id);
      room.broadcast(Opcode.TURN_RESULT, {
        playerId: player.id,
        action: action.action,
        state
      });
      return { ok: true };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[turn-engine:${room.id}]`, error);
      room.destroy();
      return {
        ok: false,
        code: ErrorCode.INVALID_TURN,
        message: "Turn processing failed"
      };
    }
  }

  private nextTurnPlayerId(currentPlayerId: string): string | undefined {
    const ids = [...this.getRoom().players.keys()];
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
