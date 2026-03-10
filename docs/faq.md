# FAQ

## Is this framework client-authoritative?

No. Game state and membership are controlled by the server runtime. Clients send intent. Rooms decide whether to accept it and how state changes.

Reference: [Architecture: Server-Authoritative Model](./architecture.md#1-server-authoritative-model)

## Can I use my own transport?

Yes. Provide `config.transport` with the required transport methods. This lets you replace the default WebSocket layer while keeping room logic unchanged.

Reference: [Transport API](./api/transport.md)

## How do I define game logic?

Create a class extending `Room<TState>` and implement the lifecycle hooks you need. Most rooms start with `onCreate`, `onJoin`, and `onMessage`.

Reference: [Getting Started](./getting-started.md)

## When should I use `onCreate()` instead of `onJoin()`?

Use `onCreate()` for room-level initialization that should happen once per room instance. Use `onJoin()` for player-specific work that should happen every time a player enters.

Reference: [Room Lifecycle API](./api/room-lifecycle.md#hook-timing)

## How do I ensure one player is not in multiple rooms?

Use the normal matchmaking or room join flows. The runtime detaches old membership before new membership is committed, and migration runs old-room `onLeave()` before new-room `onJoin()`.

Reference: [Room Migration Guide](./guides/room-migration.md)

## Does reconnect restore identity?

Yes, when the same auth token reconnects within `reconnectGraceMs`. The runtime can restore the player identity and previous room linkage during that grace period.

Reference: [Reconnect Handling](./guides/reconnect-handling.md)

## Why does importing internal files fail?

The package exports root-only modules by design. This keeps application code on the stable public API surface.

Reference: [Introduction: Import Style](./introduction.md#import-style)

## Where should I start reading?

1. [Introduction](./introduction.md)
2. [Getting Started](./getting-started.md)
3. [Architecture](./architecture.md)
4. [GameServer API](./api/gameserver.md)

## Read Next

- Previous: [Troubleshooting](./troubleshooting.md)
- See also: [Introduction](./introduction.md), [Documentation Index](./README.md)
