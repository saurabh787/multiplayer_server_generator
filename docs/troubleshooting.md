# Troubleshooting

Use this page when the runtime starts but behavior is wrong, or when load and lifecycle behavior do not match expectations.

## Common Errors

### Player stuck in queue

Likely causes:

- not enough players using the same queue parameters
- mismatched `roomType`, `mode`, `requiredPlayers`, or `maxPlayers`
- room type was not registered before matchmaking traffic started

Fix:

- ensure all intended players enqueue with identical queue settings
- verify the room was registered with `defineRoom()`
- confirm clients are authenticated before `MATCH_JOIN`

Reference: [Matchmaking API](./api/matchmaking.md)

### Room not disposing

Likely causes:

- room still has active players
- `autoDispose` is disabled in `defineRoom()`
- room code is holding resources and you are interpreting that as a room that is still active

Fix:

- confirm leave or migration completed
- set `autoDispose: true` when empty rooms should be destroyed
- make sure `onDispose()` releases timers or long-lived references

Reference: [defineRoom API](./api/defineRoom.md#roomoptions)

### Memory keeps growing

Likely causes:

- long-lived references in room or plugin logic
- oversized or frequent payload traffic
- room cleanup not releasing data structures on leave or dispose

Fix:

- run `npm run test:memory` and `npm run soak:10m`
- inspect `telemetry.log` for heap trend over time
- reduce payload size and tick workload
- review `onLeave()` and `onDispose()` for cleanup gaps

Reference: [Scaling Considerations](./guides/scaling-considerations.md)

### Transport not starting

Likely causes:

- port already in use
- custom transport missing required methods
- custom transport did not store or call runtime bindings correctly

Fix:

- check `port` and `metricsPort`
- validate the transport contract: `listen`, `close`, `send`, `disconnect`
- if using `setBindings`, verify the callbacks are stored before `listen()`

Reference: [Transport API](./api/transport.md)

### Cannot deep import

Cause:

- package exports are root-only

Fix:

- import from package root only
- do not import `src/core/*` or other internal paths from application code

Reference: [Introduction](./introduction.md#import-style)

## Debug Signals

### `telemetry.log`

Contains periodic runtime snapshots with:

- CPU estimate
- memory usage
- event loop lag
- GC counters
- tick duration summary

Use it to spot trends rather than one-off values.

### `slow-ticks.log`

Contains slow tick events where `durationMs` exceeded the configured threshold for realtime rooms.

Use it to find:

- expensive simulation spikes
- overloaded room types
- regressions after gameplay changes

### Membership invariant checks

The runtime logs an invariant violation if one player appears in multiple rooms. Treat this as a serious signal because it indicates broken room transition assumptions.

### Soak and reliability scripts

Useful scripts:

- `npm run soak:10m`
- `npm run test:reconnect`
- `npm run test:memory`
- `npm run test:eventloop`
- `npm run test:snapshot`

## Read Next

- Previous: [Scaling Considerations](./guides/scaling-considerations.md)
- Next: [FAQ](./faq.md)
- See also: [Architecture](./architecture.md), [GameServer API](./api/gameserver.md)
