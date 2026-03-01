import { BaseRoom } from "./base-room";

export class RoomManager {
  private readonly rooms = new Map<string, BaseRoom>();

  public createRoom(room: BaseRoom): void {
    this.rooms.set(room.id, room);
  }

  public getRoom(roomId: string): BaseRoom | undefined {
    return this.rooms.get(roomId);
  }

  public getAllRooms(): BaseRoom[] {
    return [...this.rooms.values()];
  }

  public removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    room.destroy();
    this.rooms.delete(roomId);
  }

  public clear(): void {
    for (const room of this.rooms.values()) {
      room.destroy();
    }
    this.rooms.clear();
  }
}
