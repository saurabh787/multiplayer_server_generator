# API: Room Lifecycle

## Overview

`Room` lifecycle hooks are where game behavior lives.

A room instance is created by the runtime, receives players and messages, optionally ticks in realtime mode, and is eventually disposed. The hooks below let you implement each phase intentionally instead of mixing setup, gameplay, and cleanup together.

## Full Hook Shape

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

## Hook Timing

### `onCreate(options?)`

What it does:

- Runs once when the room instance is created.
- Happens before player-specific lifecycle work.
- Is the correct place to initialize `this.state`.

Use it for:

- initial room state
- timers and round setup
- loading or deriving room configuration
- creating in-memory structures used for the lifetime of the room

Avoid using it for:

- player-specific welcome logic
- logic that assumes at least one player is already present

Example references:

- [Getting Started example](../getting-started.md#oncreate)
- [defineRoom example](./defineRoom.md#example)

### `onJoin(player, options?)`

What it does:

- Runs after the player becomes an active member of the room.
- Gives you a `PlayerContext` for replying to the joining player or disconnecting them.

Use it for:

- sending welcome or snapshot messages
- announcing new players to the room
- starting a match when enough players have joined
- validating room-specific requirements after join and disconnecting when needed

Example references:

- [Getting Started example](../getting-started.md#onjoinplayer)
- [defineRoom example](./defineRoom.md#example)

### `onMessage(player, type, payload)`

What it does:

- Runs when the room receives a gameplay message.
- Acts as the main input boundary for room logic.

Use it for:

- routing by message type
- validating payload shape and permissions
- mutating authoritative state
- responding with `send()` or `broadcast()`

Good practice:

- treat `payload` as untrusted input
- keep message names explicit
- centralize state mutation here or in helpers called from here

Example reference:

- [Getting Started example](../getting-started.md#onmessageplayer-type-payload)

### `onTick(deltaTime)`

What it does:

- Runs only for realtime rooms.
- Receives the elapsed time in milliseconds since the previous tick.

Use it for:

- simulation advancement
- cooldown timers
- bot updates
- periodic state reconciliation

Do not rely on it in turn-based rooms. If your room logic only changes when players act, `onMessage()` is usually enough.

Related configuration:

- server-wide `tickRate` on `GameServer`
- room-specific `tickRate` override in `defineRoom`

Reference: [defineRoom API](./defineRoom.md#roomoptions)

### `onLeave(player, reason?)`

What it does:

- Runs when a player is removed from the room.
- Also runs during migration before the player joins the next room.

Use it for:

- removing player-owned state
- updating readiness or turn order
- informing remaining players
- ending the match if the room can no longer continue

Design note:

- keep it idempotent and side-effect safe

Reference: [Room Migration Guide](../guides/room-migration.md)

### `onDispose()`

What it does:

- Runs once when the room is destroyed.
- Happens on auto-dispose, shutdown, or room-level failure isolation.

Use it for:

- clearing timers
- releasing long-lived references
- flushing final room-local diagnostics

Do not assume any players are still present when this runs.

## Call Order Guarantees

For a normal room instance:

1. `onCreate`
2. zero or more `onJoin`
3. interleaved `onMessage` and `onTick` in realtime rooms
4. zero or more `onLeave`
5. `onDispose`

Migration guarantee:

- old room `onLeave` happens before new room `onJoin`

This ordering is what preserves single-room membership.

## Related Room and Player Helpers

Inside a `Room` subclass, you can also use:

- `this.send(player, type, payload)` to reply to one player
- `this.broadcast(type, payload)` to message the whole room
- `this.disconnect(player, reason?)` to force removal

On `PlayerContext`, you have:

- `player.id`
- `player.sessionId`
- `player.metadata`
- `player.send(type, payload)`
- `player.disconnect(reason?)`

Use the room helpers when the logic is room-centric. Use the player helpers when you want the action to read as belonging to that player directly.

## Invariants

- One player, one active room membership.
- `onLeave` participates in migration and disconnect cleanup.
- Empty rooms are auto-disposed when enabled.
- `onTick` is relevant only to realtime rooms.

## Example

```ts
import { Room, PlayerContext } from "multiplayer_game_framework";

type State = { turns: number };

export class LifecycleRoom extends Room<State> {
  public onCreate(): void {
    this.state = { turns: 0 };
  }

  public onJoin(player: PlayerContext): void {
    this.send(player, "joined", { message: "joined" });
  }

  public onMessage(_player: PlayerContext, type: string): void {
    if (type === "turn") {
      this.state.turns += 1;
      this.broadcast("turns", { value: this.state.turns });
    }
  }

  public onTick(_deltaTime: number): void {
    // realtime updates
  }

  public onLeave(player: PlayerContext): void {
    this.broadcast("left", { playerId: player.id });
  }

  public onDispose(): void {
    // cleanup
  }
}
```

## How To Decide Which Hook To Use

- Need initial state or room timers: use `onCreate`.
- Need to greet or validate a player: use `onJoin`.
- Need to process gameplay input: use `onMessage`.
- Need continuous simulation: use `onTick`.
- Need to remove a player's state or notify others that they left: use `onLeave`.
- Need final teardown: use `onDispose`.

## Read Next

- Previous: [defineRoom API](./defineRoom.md)
- Next: [Transport API](./transport.md)
- See also: [Architecture](../architecture.md), [Room Migration Guide](../guides/room-migration.md)
