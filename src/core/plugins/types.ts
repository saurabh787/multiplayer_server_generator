import { Player } from "../player/player";
import { Session } from "../player/session";
import { BaseRoom } from "../room/base-room";
import type { SlowTickEvent } from "../engine/realtime-engine";

export interface Plugin {
  name: string;
  onServerStart?(): void;
  onServerStop?(): void;
  onConnect?(session: Session): void;
  onAuth?(session: Session): void;
  onRoomCreate?(room: BaseRoom): void;
  onPlayerJoin?(room: BaseRoom, player: Player): void;
  onPlayerLeave?(room: BaseRoom, player: Player): void;
  onInput?(room: BaseRoom, player: Player, input: Record<string, unknown>): void;
  beforeSnapshot?(room: BaseRoom): void;
  afterSnapshot?(room: BaseRoom, snapshot: Record<string, unknown>): void;
  onRoomDestroy?(room: BaseRoom): void;
  onRoomError?(room: BaseRoom, context: string, error: unknown): void;
  onSlowTick?(room: BaseRoom, event: SlowTickEvent): void;
}
