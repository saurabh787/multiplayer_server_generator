import { Player } from "../player/player";

export interface MatchRequest {
  player: Player;
  mode: "realtime" | "turn";
  roomType: string;
  requiredPlayers: number;
  maxPlayers: number;
}

export interface MatchedGroup {
  mode: "realtime" | "turn";
  roomType: string;
  requiredPlayers: number;
  maxPlayers: number;
  players: Player[];
}

function queueKey(request: MatchRequest): string {
  return `${request.mode}:${request.roomType}:${request.requiredPlayers}:${request.maxPlayers}`;
}

export class Matchmaker {
  private readonly queues = new Map<string, MatchRequest[]>();

  public enqueue(request: MatchRequest): MatchedGroup | undefined {
    this.cancel(request.player.id);
    const key = queueKey(request);
    const queue = this.queues.get(key) ?? [];
    queue.push(request);
    this.queues.set(key, queue);
    if (queue.length < request.requiredPlayers) {
      return undefined;
    }
    const matched = queue.splice(0, request.requiredPlayers);
    return {
      mode: request.mode,
      roomType: request.roomType,
      requiredPlayers: request.requiredPlayers,
      maxPlayers: request.maxPlayers,
      players: matched.map((item) => item.player)
    };
  }

  public cancel(playerId: string): boolean {
    let removed = false;
    for (const [key, queue] of this.queues.entries()) {
      const nextQueue = queue.filter((item) => item.player.id !== playerId);
      if (nextQueue.length !== queue.length) {
        removed = true;
        if (nextQueue.length === 0) {
          this.queues.delete(key);
        } else {
          this.queues.set(key, nextQueue);
        }
      }
    }
    return removed;
  }
}
