# API: defineRoom

## Overview

`defineRoom` registers a room type so the runtime knows how to create room instances for a given room name.

You usually call it during startup, once per room type:

- `"battle"` for combat rooms
- `"lobby"` for gathering players before a match
- `"duel"` for 1v1 rooms
- `"tactics"` for turn-based matches

Registration does not create a room immediately. It tells the server which class and options to use later when a room instance is needed.

## Signature

```ts
defineRoom<TState>(
  name: string,
  roomClass: RoomConstructor<TState>,
  options?: RoomOptions
): void
```

## Parameters

### `name`

The public room type name. Matchmaking and other room creation flows refer to this string.

Guidance:

- keep it stable once clients rely on it
- choose names that describe gameplay intent, not internal implementation details

### `roomClass`

A class extending `Room<TState>`. The runtime creates new instances of this class whenever it needs a fresh room of that type.

Reference example: [Getting Started](../getting-started.md#2-define-a-room-and-start-the-server)

### `options`

Per-room-type runtime options.

## `RoomOptions`

```ts
interface RoomOptions {
  maxClients?: number;
  tickRate?: number;
  autoDispose?: boolean;
  engine?: "realtime" | "turn";
}
```

### `maxClients`

Maximum number of players allowed in one room instance.

Use it to:

- cap match size
- reserve room shapes such as 2-player duels or 8-player arenas
- prevent overfilling when clients race to join

### `tickRate`

Realtime tick rate override for this room type.

Use it when:

- one room type needs a different simulation speed than the global default
- a lightweight room can afford a faster update rate
- a heavy room should run more slowly to stay within CPU budget

This option matters only for realtime rooms.

### `autoDispose`

When `true`, empty rooms are disposed automatically.

Enable it when rooms should disappear as soon as the last player leaves. Disable it only when you intentionally keep empty rooms alive, for example for a controlled warm state or custom orchestration flow.

### `engine`

Choose `"realtime"` or `"turn"`.

- `"realtime"` enables `onTick(deltaTime)` processing
- `"turn"` focuses on discrete message-driven actions

Reference: [Architecture: Execution Modes](../architecture.md#3-execution-modes)

## Room Class Hooks

```ts
class MyRoom extends Room<MyState> {
  onCreate(options?: unknown): void | Promise<void> {}
  onJoin(player: PlayerContext, options?: unknown): void {}
  onMessage(player: PlayerContext, type: string, payload: unknown): void {}
  onTick(deltaTime: number): void {}
  onLeave(player: PlayerContext, reason?: string): void {}
  onDispose(): void {}
}
```

Every hook is optional. Implement only what your room needs.

Quick mapping:

- `onCreate`: room setup
- `onJoin`: player arrival
- `onMessage`: gameplay input
- `onTick`: realtime updates
- `onLeave`: player departure cleanup
- `onDispose`: final cleanup

Reference: [Room Lifecycle API](./room-lifecycle.md)

## Call Timing Guarantees

- `onCreate` runs once when a room instance is created.
- `onJoin` runs after a player becomes part of the room.
- `onMessage` runs when the room receives a gameplay message.
- `onTick` runs on realtime room ticks.
- `onLeave` runs when a player is removed from the room.
- `onDispose` runs once when the room is destroyed.

The runtime also preserves the single-room membership invariant, so migration processes the old room leave before the new room join completes.

Reference: [Room Migration Guide](../guides/room-migration.md)

## Example

```ts
import { GameServer, Room, PlayerContext } from "multiplayer_game_framework";

class DuelRoom extends Room<{ score: number }> {
  public onCreate(): void {
    this.state = { score: 0 };
  }

  public onJoin(player: PlayerContext): void {
    this.send(player, "ready", { room: "duel" });
  }

  public onMessage(_player: PlayerContext, type: string): void {
    if (type !== "point") return;
    this.state.score += 1;
    this.broadcast("score", { value: this.state.score });
  }
}

const server = new GameServer();
server.defineRoom("duel", DuelRoom, {
  engine: "realtime",
  maxClients: 2,
  autoDispose: true,
  tickRate: 30
});
```

## How To Choose Options

- Use `engine: "realtime"` when simulation advances every frame or tick.
- Use `engine: "turn"` when actions happen as discrete decisions.
- Use `maxClients` to encode match shape early so room logic can assume capacity.
- Leave `autoDispose` enabled unless you have a specific reason to keep empty rooms alive.
- Override `tickRate` only when that room type really needs different timing.

## Read Next

- Previous: [GameServer API](./gameserver.md)
- Next: [Room Lifecycle API](./room-lifecycle.md)
- See also: [Room Migration Guide](../guides/room-migration.md), [Matchmaking API](./matchmaking.md)
