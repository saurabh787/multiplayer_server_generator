# Guide: Scaling Considerations

These numbers are conservative starting points, not hard limits. Your true capacity depends on room logic, payload sizes, tick frequency, CPU budget, and transport behavior.

## Baseline Capacity Guidance

Environment-dependent guidance for a single Node.js process:

- start testing at 10 to 50 active rooms
- start testing at 50 to 300 connected clients
- increase gradually while watching tick latency and memory slope

Do not treat these numbers as promises. Treat them as a first benchmark target.

## What Usually Reduces Capacity

- higher tick rates
- heavy room logic per tick
- large or frequent payloads
- bursty input traffic
- long-lived per-room memory references

The fastest way to lose capacity is to mix expensive per-tick logic with large room populations and oversized messages.

## Measurement Strategy

Use the included scripts before setting production budgets:

- `npm run soak:10m`
- `npm run test:memory`
- `npm run test:eventloop`
- `npm run test:snapshot`

Track:

- heap growth trend over time
- GC activity frequency and pause behavior
- slow tick frequency and durations
- event loop lag during peak load

Reference: [Troubleshooting](../troubleshooting.md#debug-signals)

## Practical Scaling Loop

1. Start with a representative room type and realistic bot traffic.
2. Measure tick duration, memory, and disconnect behavior.
3. Change one variable at a time such as `tickRate`, room size, or payload shape.
4. Repeat until you know the failure threshold and an acceptable operating budget.

This is more useful than guessing capacity from hardware specs alone.

## When To Cluster Or Shard

Consider clustering or sharding when:

- CPU saturation causes sustained slow ticks
- memory growth exceeds your process budget
- one process can no longer meet latency targets
- operational isolation between room groups becomes necessary

## Common Horizontal Scaling Shape

1. Keep room authority single-process per room.
2. Shard room allocation across multiple server processes.
3. Add external coordination for player-to-room routing and discovery.

This preserves the room-authoritative model while letting the fleet grow horizontally.

## Room Design Tips That Help Scaling

- keep `onTick()` cheap and predictable
- validate and compact payloads in `onMessage()`
- release timers and references in `onDispose()`
- avoid storing more per-player room state than the gameplay actually needs

Reference: [Room Lifecycle API](../api/room-lifecycle.md)

## Read Next

- Previous: [Reconnect Handling](./reconnect-handling.md)
- Next: [Troubleshooting](../troubleshooting.md)
- See also: [Architecture](../architecture.md), [Matchmaking API](../api/matchmaking.md)
