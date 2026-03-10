import { PlayerContext } from "../../public/player-context";
import { Room as PublicRoom } from "../../public/room";
import { RoomConstructor, RoomOptions } from "../../public/types";
import { Opcode } from "../../types/opcode";
import { Player } from "../player/player";
import { PluginSystem } from "../plugins/plugin-system";
import { RealtimeRoom } from "./realtime-room";
import { RoomSendContext } from "./base-room";
import { TurnRoom } from "./turn-room";

interface PublicRuntimeContext {
  disconnectPlayer: (playerId: string, reason?: string) => void;
}

class RuntimePlayerContext implements PlayerContext {
  public readonly id: string;
  public readonly sessionId: string;
  public readonly metadata: Readonly<Record<string, unknown>>;
  private readonly sendToSession: RoomSendContext["sendToSession"];
  private readonly onDisconnect: (playerId: string, reason?: string) => void;

  public constructor(
    player: Player,
    sendToSession: RoomSendContext["sendToSession"],
    onDisconnect: (playerId: string, reason?: string) => void
  ) {
    this.id = player.id;
    this.sessionId = player.sessionId;
    this.metadata = Object.freeze({ ...player.metadata });
    this.sendToSession = sendToSession;
    this.onDisconnect = onDisconnect;
  }

  public send(type: string, payload: unknown): void {
    this.sendToSession(this.sessionId, Opcode.ROOM_MESSAGE, { type, payload });
  }

  public disconnect(reason?: string): void {
    this.onDisconnect(this.id, reason);
  }
}

abstract class PublicRoomHostBase {
  protected readonly publicRoom: PublicRoom;
  protected readonly sendContext: RoomSendContext;
  protected readonly runtimeContext: PublicRuntimeContext;
  protected readonly roomId: string;
  protected readonly options?: RoomOptions;

  public constructor(
    roomId: string,
    publicRoomClass: RoomConstructor,
    sendContext: RoomSendContext,
    runtimeContext: PublicRuntimeContext,
    options?: RoomOptions
  ) {
    this.roomId = roomId;
    this.publicRoom = new publicRoomClass();
    this.sendContext = sendContext;
    this.runtimeContext = runtimeContext;
    this.options = options;
  }

  public bindContext(getPlayers: () => Player[]): void {
    this.publicRoom.__bindContext({
      roomId: this.getRoomId(),
      get playerCount() {
        return getPlayers().length;
      },
      broadcast: (type, payload) => {
        for (const player of getPlayers()) {
          this.sendContext.sendToSession(player.sessionId, Opcode.ROOM_MESSAGE, { type, payload });
        }
      },
      sendTo: (playerId, type, payload) => {
        const player = getPlayers().find((entry) => entry.id === playerId);
        if (!player) {
          return;
        }
        this.sendContext.sendToSession(player.sessionId, Opcode.ROOM_MESSAGE, { type, payload });
      },
      getPlayers: () =>
        getPlayers().map((player) => this.toPlayerContext(player)),
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
      disconnect: (playerId, reason) => this.runtimeContext.disconnectPlayer(playerId, reason)
    });
  }

  public onCreate(): void {
    const result = this.publicRoom.onCreate();
    if (result instanceof Promise) {
      void result.catch((error) => {
        // eslint-disable-next-line no-console
        console.error("[public-room:onCreate]", error);
      });
    }
  }

  public onJoin(player: Player): void {
    this.publicRoom.onJoin(this.toPlayerContext(player));
  }

  public onLeave(player: Player): void {
    this.publicRoom.onLeave(this.toPlayerContext(player));
  }

  public onDispose(): void {
    this.publicRoom.onDispose();
  }

  public onMessage(player: Player, type: string, payload: unknown): void {
    this.publicRoom.onMessage(this.toPlayerContext(player), type, payload);
  }

  public onTick(deltaTime: number): void {
    this.publicRoom.onTick(deltaTime);
  }

  public getState(): Record<string, unknown> {
    const state = this.publicRoom.__getState();
    if (state === null || state === undefined) {
      return {};
    }
    if (typeof state !== "object" || Array.isArray(state)) {
      return { value: state };
    }
    return state as Record<string, unknown>;
  }

  private toPlayerContext(player: Player): PlayerContext {
    return new RuntimePlayerContext(player, this.sendContext.sendToSession, this.runtimeContext.disconnectPlayer);
  }

  protected abstract getRoomId(): string;
}

export class PublicRealtimeRoomHost extends RealtimeRoom {
  private readonly host: PublicRoomHostBase;

  public constructor(
    id: string,
    roomType: string,
    maxPlayers: number,
    pluginSystem: PluginSystem,
    sendContext: RoomSendContext,
    publicRoomClass: RoomConstructor,
    runtimeContext: PublicRuntimeContext,
    options?: RoomOptions
  ) {
    super(id, roomType, maxPlayers, pluginSystem, sendContext);
    this.host = new (class extends PublicRoomHostBase {
      protected getRoomId(): string {
        return this.roomId;
      }
    })(id, publicRoomClass, sendContext, runtimeContext, options);
    this.host.bindContext(() => [...this.players.values()]);
  }

  public onInit(): void {
    this.host.onCreate();
  }

  public onPlayerJoin(player: Player): void {
    this.host.onJoin(player);
  }

  public onPlayerLeave(player: Player): void {
    this.host.onLeave(player);
  }

  public onInput(player: Player, input: Record<string, unknown>): void {
    super.onInput(player, input);
    const hasPayload = Object.prototype.hasOwnProperty.call(input, "payload");
    const type = typeof input.type === "string" ? input.type : "input";
    const payload = hasPayload ? input.payload : input;
    this.host.onMessage(player, type, payload);
  }

  public onTick(deltaMs: number): void {
    this.host.onTick(deltaMs);
  }

  public getSnapshot(): Record<string, unknown> {
    return this.host.getState();
  }

  protected onInternalDestroy(): void {
    this.host.onDispose();
  }
}

export class PublicTurnRoomHost extends TurnRoom {
  private readonly host: PublicRoomHostBase;

  public constructor(
    id: string,
    roomType: string,
    maxPlayers: number,
    pluginSystem: PluginSystem,
    sendContext: RoomSendContext,
    publicRoomClass: RoomConstructor,
    runtimeContext: PublicRuntimeContext,
    options?: RoomOptions
  ) {
    super(id, roomType, maxPlayers, pluginSystem, sendContext);
    this.host = new (class extends PublicRoomHostBase {
      protected getRoomId(): string {
        return this.roomId;
      }
    })(id, publicRoomClass, sendContext, runtimeContext, options);
    this.host.bindContext(() => [...this.players.values()]);
  }

  public onInit(): void {
    this.host.onCreate();
  }

  public onPlayerJoin(player: Player): void {
    super.onPlayerJoin(player);
    this.host.onJoin(player);
  }

  public onPlayerLeave(player: Player): void {
    super.onPlayerLeave(player);
    this.host.onLeave(player);
  }

  public onTurn(player: Player, action: { action: number; data?: Record<string, unknown> }): Record<string, unknown> {
    this.host.onMessage(player, "turn_action", action);
    return this.getState();
  }

  public getState(): Record<string, unknown> {
    return this.host.getState();
  }

  protected onInternalDestroy(): void {
    this.host.onDispose();
  }
}
