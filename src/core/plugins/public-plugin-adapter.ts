import { PlayerContext } from "../../public/player-context";
import { Plugin as PublicPlugin } from "../../public/plugin";
import { Room } from "../../public/room";
import { PublicRoomErrorEvent, PublicSlowTickEvent } from "../../public/types";
import { Player } from "../player/player";
import { BaseRoom } from "../room/base-room";
import { Plugin } from "./types";

interface AdapterOptions {
  disconnectPlayer: (playerId: string, reason?: string) => void;
  sendToPlayer: (playerId: string, type: string, payload: unknown) => void;
}

class PublicRoomAdapter extends Room<Record<string, unknown>> {
  public readonly id: string;
  public readonly roomType: string;
  public readonly mode: "realtime" | "turn";

  public constructor(room: BaseRoom) {
    super();
    this.id = room.id;
    this.roomType = room.roomType;
    this.mode = room.type;
  }
}

class PublicPlayerAdapter implements PlayerContext {
  public readonly id: string;
  public readonly sessionId: string;
  public readonly metadata: Readonly<Record<string, unknown>>;
  private readonly onDisconnect: (playerId: string, reason?: string) => void;
  private readonly onSend: (playerId: string, type: string, payload: unknown) => void;

  public constructor(
    player: Player,
    onDisconnect: (playerId: string, reason?: string) => void,
    onSend: (playerId: string, type: string, payload: unknown) => void
  ) {
    this.id = player.id;
    this.sessionId = player.sessionId;
    this.metadata = Object.freeze({ ...player.metadata });
    this.onDisconnect = onDisconnect;
    this.onSend = onSend;
  }

  public send(type: string, payload: unknown): void {
    this.onSend(this.id, type, payload);
  }

  public disconnect(reason?: string): void {
    this.onDisconnect(this.id, reason);
  }
}

export function adaptPublicPlugin(plugin: PublicPlugin, options: AdapterOptions): Plugin {
  const roomAdapters = new Map<string, PublicRoomAdapter>();

  const getRoom = (room: BaseRoom): PublicRoomAdapter => {
    const existing = roomAdapters.get(room.id);
    if (existing) {
      return existing;
    }
    const created = new PublicRoomAdapter(room);
    roomAdapters.set(room.id, created);
    return created;
  };

  const toPlayer = (player: Player): PublicPlayerAdapter =>
    new PublicPlayerAdapter(player, options.disconnectPlayer, options.sendToPlayer);

  const toPublicRoomErrorEvent = (context: string, error: unknown): PublicRoomErrorEvent => {
    if (error instanceof Error) {
      return {
        context,
        error: {
          name: error.name,
          message: error.message
        }
      };
    }
    return {
      context,
      error: {
        name: "Error",
        message: String(error)
      }
    };
  };

  const toPublicSlowTickEvent = (event: {
    ts: string;
    roomId: string;
    durationMs: number;
    thresholdMs: number;
  }): PublicSlowTickEvent => ({
    ts: event.ts,
    roomId: event.roomId,
    durationMs: event.durationMs,
    thresholdMs: event.thresholdMs
  });

  return {
    name: plugin.name ?? "public-plugin",
    onServerStart: plugin.onServerStart ? () => plugin.onServerStart?.() : undefined,
    onServerStop: plugin.onServerStop ? () => plugin.onServerStop?.() : undefined,
    onRoomCreate: plugin.onRoomCreate ? (room) => plugin.onRoomCreate?.(getRoom(room)) : undefined,
    onPlayerJoin: plugin.onPlayerJoin ? (room, player) => plugin.onPlayerJoin?.(getRoom(room), toPlayer(player)) : undefined,
    onPlayerLeave: plugin.onPlayerLeave ? (room, player) => plugin.onPlayerLeave?.(getRoom(room), toPlayer(player)) : undefined,
    onSlowTick: plugin.onSlowTick ? (room, event) => plugin.onSlowTick?.(getRoom(room), toPublicSlowTickEvent(event)) : undefined,
    onRoomError:
      plugin.onRoomError
        ? (room, context, error) => plugin.onRoomError?.(getRoom(room), toPublicRoomErrorEvent(context, error))
        : undefined,
    onRoomDestroy: (room) => {
      plugin.onRoomDispose?.(getRoom(room));
      roomAdapters.delete(room.id);
    }
  };
}
