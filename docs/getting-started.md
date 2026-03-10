# Getting Started

This guide gets a minimal room running, then explains what each hook in the example is responsible for.

## 1. Install

```bash
npm install multiplayer_game_framework
```

## 2. Define a Room and Start the Server

```ts
import { GameServer, Room, PlayerContext } from "multiplayer_game_framework";

class BattleRoom extends Room<{ moves: number }> {
  public onCreate(): void {
    this.state = { moves: 0 };
  }

  public onJoin(player: PlayerContext): void {
    this.send(player, "welcome", { id: player.id });
  }

  public onMessage(player: PlayerContext, type: string, payload: unknown): void {
    if (type !== "move") return;
    this.state.moves += 1;
    this.send(player, "moved", { moves: this.state.moves, payload });
  }
}

const server = new GameServer({
  config: {
    port: 3000,
    metricsPort: 3001,
    tickRate: 20
  }
});

server.defineRoom("battle", BattleRoom, {
  engine: "realtime",
  maxClients: 8,
  autoDispose: true
});

await server.start();
```

## 3. Understand the Example

### `onCreate()`

`onCreate()` runs once for each new room instance, before players start using it. In the example it initializes the authoritative room state with `this.state = { moves: 0 }`.

Common uses for `onCreate()`:

- create the initial room state
- read room options if your application passes setup data
- schedule delayed room work
- prepare in-memory structures such as maps, timers, or round trackers

Keep it focused on room initialization. If you need per-player setup, use `onJoin()` instead.

More detail: [Room Lifecycle API: `onCreate(options?)`](./api/room-lifecycle.md#oncreateoptions)

### `onJoin(player)`

`onJoin()` runs after the player is part of the room. In the example it sends a welcome event back to the joining player with `this.send(player, "welcome", ...)`.

Common uses for `onJoin()`:

- send initial room data or a snapshot
- announce the new player to other players
- validate player metadata and disconnect if the room rules reject the join
- start the match once enough players have arrived

More detail: [Room Lifecycle API: `onJoin(player, options?)`](./api/room-lifecycle.md#onjoinplayer-options)

### `onMessage(player, type, payload)`

`onMessage()` handles gameplay inputs. In the example the room accepts only `"move"`, increments `moves`, and responds with the updated count.

Common uses for `onMessage()`:

- validate message type and payload shape
- apply authoritative state changes
- broadcast results to all players or reply to one player
- reject invalid or out-of-order actions

More detail: [Room Lifecycle API: `onMessage(player, type, payload)`](./api/room-lifecycle.md#onmessageplayer-type-payload)

### Hooks Not Used in This First Example

The example omits:

- `onTick(deltaTime)` for realtime simulation work
- `onLeave(player, reason?)` for departure cleanup
- `onDispose()` for room shutdown cleanup

Reference: [Room Lifecycle API](./api/room-lifecycle.md)

## 4. Confirm It Is Running

- WebSocket endpoint: `ws://localhost:3000`
- Metrics endpoint: `http://localhost:3001/metrics`

If the server starts cleanly, clients can connect to the WebSocket endpoint and the metrics endpoint should expose runtime counters for your process.

## 5. Stop Gracefully

```ts
await server.stop();
```

Use graceful shutdown during development and deployment so rooms can dispose cleanly and transports can close without dropping the process abruptly.

## Where To Go Next

- To understand why players can only belong to one room at a time, read [Architecture](./architecture.md#4-membership-invariant).
- To learn how room options such as `engine`, `tickRate`, and `autoDispose` work, read [defineRoom API](./api/defineRoom.md).
- To see every lifecycle hook with more examples, read [Room Lifecycle API](./api/room-lifecycle.md).

## Read Next

- Previous: [Introduction](./introduction.md)
- Next: [Architecture](./architecture.md)
- See also: [defineRoom API](./api/defineRoom.md), [Room Lifecycle API](./api/room-lifecycle.md)
