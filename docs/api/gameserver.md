# API: GameServer

## Overview

`GameServer` is the main runtime entrypoint.

Use it to:

- configure networking and runtime limits
- register room types
- attach plugins
- start and stop the server
- inspect runtime metrics

In most applications, one `GameServer` instance represents one server process.

## Signature

```ts
class GameServer {
  constructor(options?: {
    config?: ServerConfig;
    onRealtimeTickMeasured?: (durationMs: number) => void;
    onSlowTick?: (event: PublicSlowTickEvent) => void;
  });

  start(): Promise<void>;
  stop(): Promise<void>;
  listen(): Promise<void>;
  shutdown(): Promise<void>;

  use(plugin: Plugin): void;

  defineRoom<TState>(
    name: string,
    roomClass: RoomConstructor<TState>,
    options?: RoomOptions
  ): void;

  metrics(): Record<string, unknown>;
}
```

## Constructor Options

### `config`

`config` controls transport, runtime safety limits, and timing behavior.

Common fields:

- `port`: main WebSocket port for the default transport
- `metricsPort`: HTTP port for metrics output
- `tickRate`: default realtime tick rate for rooms that do not override it
- `reconnectGraceMs`: reconnect window for session restoration
- `slowTickThresholdMs`: threshold used for slow-tick reporting
- `transport`: custom transport implementation

Other supported limits include packet size, ping interval, session timeout, input rate limiting, and backpressure thresholds.

Reference: [Transport API](./transport.md) and [Scaling Considerations](../guides/scaling-considerations.md)

### `onRealtimeTickMeasured`

Called with the measured tick duration in milliseconds. Use it when you want to feed custom monitoring or diagnostics code.

Typical use cases:

- send tick timing to your metrics stack
- compare room load before and after gameplay changes
- track performance regressions during load tests

### `onSlowTick`

Called when a realtime tick exceeds the configured slow-tick threshold.

Typical use cases:

- log performance spikes with room identifiers
- trigger local diagnostics during soak tests
- alert when simulation work exceeds target latency

## Lifecycle Methods

### `start()` and `listen()`

Start the server and begin accepting connections. `listen()` is an alias of `start()`.

Call this after:

- creating the `GameServer`
- defining all room types needed at boot
- attaching any plugins that should observe startup and room events

### `stop()` and `shutdown()`

Stop the server and dispose runtime resources. `shutdown()` is an alias of `stop()`.

Expected effects:

- the transport stops accepting new work
- rooms are allowed to dispose cleanly
- shutdown-related plugin hooks can run

Use graceful shutdown in development scripts and production deployments.

## Registration and Extension Methods

### `defineRoom(name, roomClass, options?)`

Registers a room type so matchmaking or server-side flows can create instances of it.

Important details:

- registration usually happens at startup
- the room class is a factory for future room instances, not a singleton
- `options` choose the engine mode, capacity, tick rate override, and disposal behavior

Reference: [defineRoom API](./defineRoom.md)

### `use(plugin)`

Attaches a plugin that can observe lifecycle events such as server start, room create, player join, slow ticks, and room errors.

Use plugins when you want cross-cutting behavior such as:

- logging
- metrics emission
- audits
- generic moderation or disconnect policies

## `metrics()`

Returns a runtime metrics snapshot as a plain object.

Use it when you want:

- a programmatic metrics snapshot in tests or diagnostics
- custom monitoring integration
- to compare metrics before and after a load scenario

If you expose `metricsPort`, the runtime also publishes metrics over HTTP.

## Example

```ts
import { GameServer } from "multiplayer_game_framework";

const server = new GameServer({
  config: {
    port: 3000,
    metricsPort: 3001,
    tickRate: 20,
    reconnectGraceMs: 10_000
  }
});

await server.start();

const metrics = server.metrics();
console.log(metrics);

await server.stop();
```

## Common Setup Pattern

1. Create the server with config.
2. Register room types with `defineRoom()`.
3. Attach plugins with `use()` if needed.
4. Call `start()`.
5. Stop with `stop()` during shutdown.

The [Getting Started](../getting-started.md) guide shows the smallest version of this flow.

## Read Next

- Previous: [Architecture](../architecture.md)
- Next: [defineRoom API](./defineRoom.md)
- See also: [Transport API](./transport.md), [Troubleshooting](../troubleshooting.md)
