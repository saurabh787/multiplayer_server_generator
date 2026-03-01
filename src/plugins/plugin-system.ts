import { Player } from "../player/player";
import { Session } from "../player/session";
import { BaseRoom } from "../room/base-room";
import { Plugin } from "./types";

export class PluginSystem {
  private readonly plugins: Plugin[];

  public constructor(initialPlugins: Plugin[] = []) {
    this.plugins = [...initialPlugins];
  }

  public add(plugin: Plugin): void {
    this.plugins.push(plugin);
  }

  public getAll(): Plugin[] {
    return [...this.plugins];
  }

  public onConnect(session: Session): void {
    this.safeInvoke((plugin) => plugin.onConnect?.(session));
  }

  public onAuth(session: Session): void {
    this.safeInvoke((plugin) => plugin.onAuth?.(session));
  }

  public onRoomCreate(room: BaseRoom): void {
    this.safeInvoke((plugin) => plugin.onRoomCreate?.(room));
  }

  public onPlayerJoin(room: BaseRoom, player: Player): void {
    this.safeInvoke((plugin) => plugin.onPlayerJoin?.(room, player));
  }

  public onPlayerLeave(room: BaseRoom, player: Player): void {
    this.safeInvoke((plugin) => plugin.onPlayerLeave?.(room, player));
  }

  public onInput(room: BaseRoom, player: Player, input: Record<string, unknown>): void {
    this.safeInvoke((plugin) => plugin.onInput?.(room, player, input));
  }

  public beforeSnapshot(room: BaseRoom): void {
    this.safeInvoke((plugin) => plugin.beforeSnapshot?.(room));
  }

  public afterSnapshot(room: BaseRoom, snapshot: Record<string, unknown>): void {
    this.safeInvoke((plugin) => plugin.afterSnapshot?.(room, snapshot));
  }

  public onRoomDestroy(room: BaseRoom): void {
    this.safeInvoke((plugin) => plugin.onRoomDestroy?.(room));
  }

  private safeInvoke(callback: (plugin: Plugin) => void): void {
    for (const plugin of this.plugins) {
      try {
        callback(plugin);
      } catch (error) {
        // Plugin failures are always isolated.
        // eslint-disable-next-line no-console
        console.error(`[plugin:${plugin.name}]`, error);
      }
    }
  }
}
