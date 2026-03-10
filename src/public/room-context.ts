import { PlayerContext } from "./player-context";

export interface RoomContext {
  readonly roomId: string;
  readonly playerCount: number;
  broadcast(type: string, payload: unknown): void;
  sendTo(playerId: string, type: string, payload: unknown): void;
  getPlayers(): ReadonlyArray<PlayerContext>;
  schedule(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  disconnect(playerId: string, reason?: string): void;
}
