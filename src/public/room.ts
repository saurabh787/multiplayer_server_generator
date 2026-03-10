import { PlayerContext } from "./player-context";
import { RoomContext } from "./room-context";

export abstract class Room<TState = Record<string, unknown>> {
  protected state!: TState;
  private context?: RoomContext;

  public onCreate(_options?: unknown): void | Promise<void> {}
  public onJoin(_player: PlayerContext, _options?: unknown): void {}
  public onLeave(_player: PlayerContext, _reason?: string): void {}
  public onDispose(): void {}
  public onMessage(_player: PlayerContext, _type: string, _payload: unknown): void {}
  public onTick(_deltaTime: number): void {}

  public __bindContext(context: RoomContext): void {
    this.context = context;
  }

  public __getState(): TState {
    return this.state;
  }

  protected broadcast(type: string, payload: unknown): void {
    this.getContext().broadcast(type, payload);
  }

  protected send(player: PlayerContext, type: string, payload: unknown): void {
    this.getContext().sendTo(player.id, type, payload);
  }

  protected disconnect(player: PlayerContext, reason?: string): void {
    this.getContext().disconnect(player.id, reason);
  }

  private getContext(): RoomContext {
    if (!this.context) {
      throw new Error("RoomContext is not bound");
    }
    return this.context;
  }
}
