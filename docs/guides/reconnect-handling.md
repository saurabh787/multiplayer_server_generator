# Guide: Reconnect Handling

The framework supports identity restoration using auth tokens and a reconnect grace window.

This feature is useful when mobile networks drop briefly, browsers refresh, or a client reconnects after a short interruption and should regain the same player identity.

## Reconnect Model

1. Client authenticates with a stable `token`.
2. Server maps that token to player identity.
3. If the connection drops, the player enters a grace window.
4. Re-authenticating with the same token restores identity and session linkage if the grace window is still open.

## What Gets Restored

When reconnect succeeds within the grace period, the runtime can restore:

- `playerId`
- previous `roomId`
- reconnect status in auth response such as `reconnected: true`

This lets your application treat the reconnecting client as the same player instead of creating a brand-new identity.

## Timeout Behavior

- Grace duration is controlled by `reconnectGraceMs`.
- If reconnect does not happen in time, the player is finalized as disconnected and removed from the room.
- Room-side cleanup then follows normal leave behavior.

Reference: [Room Lifecycle API: `onLeave(player, reason?)`](../api/room-lifecycle.md#onleaveplayer-reason)

## Example

```ts
import { GameServer } from "multiplayer_game_framework";

const server = new GameServer({
  config: {
    reconnectGraceMs: 10_000
  }
});

await server.start();
```

Client auth should include a stable token:

```ts
client.send(Opcode.AUTH, {
  protocolVersion: 1,
  token: "user-123"
});
```

## Operational Advice

- Keep tokens stable per player identity.
- Choose grace duration based on your client platform and expected network volatility.
- Test reconnect under load, not only in isolated local runs.
- Decide what the client should show during the grace window: reconnect spinner, paused gameplay, or spectator fallback.

## Interaction With Room Logic

Reconnect support is most effective when room code is designed for brief interruptions:

- avoid deleting all player-owned state immediately unless the runtime has finalized the disconnect
- make leave handling tolerant of reconnect timing
- send a fresh state snapshot or welcome payload from `onJoin()` if your client needs a full resync after reconnect

Related references:

- [Getting Started: `onJoin(player)`](../getting-started.md#onjoinplayer)
- [Room Migration Guide](./room-migration.md)

## Read Next

- Previous: [Room Migration](./room-migration.md)
- Next: [Scaling Considerations](./scaling-considerations.md)
- See also: [Troubleshooting](../troubleshooting.md), [GameServer API](../api/gameserver.md)
