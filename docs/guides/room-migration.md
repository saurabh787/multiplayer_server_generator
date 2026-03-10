# Guide: Room Migration

Room migration means moving a player from one room to another while preserving the single-room membership invariant.

This usually happens when:

- a lobby sends players into a match room
- a match moves survivors into a results room
- an application-specific flow upgrades a player from one phase to another

## Why It Matters

Without strict migration sequencing, a player can:

- appear in two rooms at once
- miss `onLeave()` cleanup in the old room
- enter the new room before the old room has released related state

The framework prevents that by enforcing a leave-then-join order.

## Safe Migration Flow

1. Detach the player from the current room.
2. Process `onLeave()` in the old room.
3. Clear previous room and session linkage.
4. Add the player to the new room.
5. Trigger `onJoin()` in the new room.

This order keeps both rooms internally consistent.

## What Detach Logic Enforces

Conceptually, room detachment enforces:

- leave processing before new room assignment
- cleanup of stale membership references
- optional room disposal when the old room becomes empty

Because the runtime owns this flow, application room code can focus on what to do when a player leaves or arrives, not on bookkeeping across two rooms at once.

## Guarantees

- `onLeave()` is invoked before migration join completes.
- Player membership remains single-room.
- Empty rooms auto-dispose when configured.

Reference: [Architecture: Membership Invariant](../architecture.md#4-membership-invariant)

## Practical Advice For Room Code

- Keep `onLeave()` idempotent and side-effect safe.
- Do not assume migration is instantaneous from the client perspective.
- If state must move between rooms, make that handoff explicit in your application flow.
- Use room messages to notify clients about migration boundaries when needed.

Good pattern:

- old room broadcasts that the player left
- application flow chooses the next room
- new room sends a fresh welcome or snapshot payload in `onJoin()`

## Related Hooks

- Use `onLeave()` to clear old-room state.
- Use `onJoin()` to initialize new-room state for that player.
- Use `onDispose()` to release leftover resources if the old room becomes empty and auto-disposes.

Reference: [Room Lifecycle API](../api/room-lifecycle.md)

## Read Next

- Previous: [Matchmaking API](../api/matchmaking.md)
- Next: [Reconnect Handling](./reconnect-handling.md)
- See also: [Room Lifecycle API](../api/room-lifecycle.md), [Troubleshooting](../troubleshooting.md)
