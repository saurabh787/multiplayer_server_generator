import { PlayerContext } from "./player-context";
import { Room } from "./room";
import { PublicRoomErrorEvent, PublicSlowTickEvent } from "./types";

export interface Plugin {
  name?: string;
  onServerStart?(): void;
  onServerStop?(): void;
  onRoomCreate?(room: Room): void;
  onRoomDispose?(room: Room): void;
  onPlayerJoin?(room: Room, player: PlayerContext): void;
  onPlayerLeave?(room: Room, player: PlayerContext): void;
  onSlowTick?(room: Room, event: PublicSlowTickEvent): void;
  onRoomError?(room: Room, event: PublicRoomErrorEvent): void;
}
