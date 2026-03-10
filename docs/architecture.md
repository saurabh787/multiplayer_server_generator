# Architecture

This page explains how the framework behaves at runtime so the API surface in the other docs has a clear mental model behind it.

## 1. Server-Authoritative Model

The server is the source of truth for:

- room state
- player membership
- accepted gameplay actions
- room disposal

Clients send intent. Rooms decide whether that intent is valid and what state change should follow.

Why this model:

- Prevents clients from authoritatively mutating shared state.
- Reduces cheating and client divergence risk.
- Keeps lifecycle and matchmaking decisions centralized.

Tradeoff:

- You must design around network latency and finite server capacity.

Design implication:

- Put game rules in room code, not in client code alone.
- Treat client packets as requests, not trusted facts.

## 2. Room Lifecycle Model

Each room instance follows a predictable lifecycle:

1. The server creates a room runtime.
2. `onCreate` runs once.
3. Players join and trigger `onJoin`.
4. Gameplay messages and, in realtime rooms, ticks drive room logic.
5. Leaving players trigger `onLeave`.
6. The room is disposed and `onDispose` runs once.

This matters because each hook has a specific job:

- `onCreate` is for room-level initialization
- `onJoin` is for player arrival handling
- `onMessage` is for authoritative gameplay input
- `onTick` is for frame-like updates in realtime mode
- `onLeave` is for membership cleanup
- `onDispose` is for final cleanup

Reference: [Room Lifecycle API](./api/room-lifecycle.md)

## 3. Execution Modes

Rooms can run in one of two modes through `defineRoom(..., { engine })`:

### Realtime

- `onTick(deltaTime)` is called at the configured tick rate.
- Best for action games, simulations, and state that advances continuously.
- You can still use `onMessage` for player inputs.

### Turn

- No realtime tick loop is expected.
- Player actions arrive through messages and are processed as discrete events.
- Best for board games, tactics, or asynchronous turn flows.

Reference: [defineRoom API](./api/defineRoom.md#roomoptions)

## 4. Membership Invariant

Invariant: a player can exist in exactly one active room at a time.

How it is enforced:

- Before joining a new room, the runtime detaches the player from the current room.
- Old-room leave processing happens before the new membership is finalized.
- Internal invariant checks log if a player appears in multiple rooms.

This is one of the most important guarantees in the framework. It keeps room logic simpler because each room can assume the player either belongs there or does not.

Reference: [Room Migration Guide](./guides/room-migration.md)

## 5. Disposal and Error Isolation

Disposal rules:

- If `autoDispose` is `true`, empty rooms are disposed automatically.
- Rooms are also disposed during server shutdown.
- Runtime isolation favors server stability. If a room hits a fatal lifecycle problem, the framework disposes that room instead of letting the failure contaminate the whole process.

Design implication:

- Keep room cleanup idempotent.
- Do not assume a room instance lives forever.
- Release timers, references, and other in-memory resources in `onDispose()`.

## 6. Transport Injection Model

Default transport:

- WebSocket transport is used when no custom transport is provided.

Custom transport:

- Pass `config.transport` to `new GameServer({ config })`.
- The runtime binds connection, packet, and disconnect callbacks to that transport.
- Your room code stays the same because it depends on `Room`, `PlayerContext`, and messages, not on a socket library directly.

Required contract:

- `listen(): Promise<void>`
- `close(): Promise<void>`
- `send(sessionId, opcode, payload): void`
- `disconnect(sessionId): void`
- optional `setBindings(config, events, metricsProvider): void`

Reference: [Transport API](./api/transport.md)

## 7. Public API Boundary

The package keeps a strict API boundary:

- `src/public/*` defines the stable developer-facing surface
- runtime internals are implementation details
- package exports expose the root module only

Why that matters:

- you import fewer concepts
- the maintainers can evolve internals more safely
- application code avoids coupling to runtime details that may change

## Read Next

- Previous: [Getting Started](./getting-started.md)
- Next: [GameServer API](./api/gameserver.md)
- See also: [Room Lifecycle API](./api/room-lifecycle.md), [Room Migration Guide](./guides/room-migration.md)
