import { BaseRoom } from "../room/base-room";

export interface Engine<TRoom extends BaseRoom = BaseRoom> {
  attachRoom(room: TRoom): void;
  start(): void;
  stop(): void;
}
