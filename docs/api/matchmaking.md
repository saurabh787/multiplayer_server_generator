# API: Matchmaking

## Overview

The framework includes queue-based matchmaking.

There is no separate public JavaScript matchmaker class. Matchmaking is driven through the server protocol and room definitions you register on `GameServer`.

## What Matchmaking Groups By

Match requests are grouped by a queue key made from:

- room mode (`realtime` or `turn`)
- room type
- `requiredPlayers`
- `maxPlayers`

Players will only be matched together when these values align. If one client asks for `requiredPlayers: 2` and another asks for `requiredPlayers: 4`, they are not in the same queue.

## Queue Behavior

Core behavior:

- FIFO within each queue key
- player deduplication on enqueue
- room creation when enough players are present
- join events emitted after the room is created

Practical implication:

- clients that should match together must send the same queue parameters
- room type registration with `defineRoom()` must exist before those matches are created

Reference: [defineRoom API](./defineRoom.md)

## Join and Cancel Semantics

### `MATCH_JOIN`

Adds the player to a queue.

Before enqueueing, the runtime detaches any current room membership so the single-room invariant stays intact.

Use it when:

- placing a player into a normal public queue
- retrying after a previous match was canceled or finished
- joining a queue after reconnect and client recovery

### `MATCH_CANCEL`

Removes the player from the active queue.

Use it when:

- the user backs out of matchmaking
- the client changes queue settings
- the application moves the player into another flow

## Example Flow

```ts
client.send(Opcode.MATCH_JOIN, {
  roomType: "battle",
  mode: "realtime",
  requiredPlayers: 2,
  maxPlayers: 2
});

// when matched:
// Opcode.MATCH_FOUND -> contains roomId/roomType/mode
// Opcode.ROOM_JOINED -> confirms room entry

client.send(Opcode.MATCH_CANCEL, {});
```

This is a protocol example rather than a server-side JavaScript API. Your client sends the packet. The server matches compatible players, creates a room, and then moves the player into that room.

## How Matchmaking Relates To Room Lifecycle

Once a match is formed:

1. the runtime creates a room instance
2. `onCreate()` runs once
3. matched players are joined
4. `onJoin()` runs for each player

If the player was already in another room, the old room `onLeave()` happens before the new room join completes.

References:

- [Room Lifecycle API](./room-lifecycle.md)
- [Room Migration Guide](../guides/room-migration.md)

## Notes

- `requiredPlayers` controls when a room is created.
- `maxPlayers` controls room capacity after creation.
- `roomType` must match a name registered with `defineRoom()`.
- Use consistent queue parameters across clients that should be matched together.

## Read Next

- Previous: [Transport API](./transport.md)
- Next: [Room Migration Guide](../guides/room-migration.md)
- See also: [defineRoom API](./defineRoom.md), [Reconnect Handling](../guides/reconnect-handling.md)
