# Introduction

`multiplayer_game_framework` is a server-authoritative multiplayer framework for room-based games.

It is designed for games where the server owns the truth for room membership, state updates, and player messaging. Clients send inputs. Rooms decide what those inputs mean.

## What It Solves

- Keeps shared game state on the server instead of trusting clients.
- Enforces one active room membership per player.
- Provides a simple lifecycle for room creation, join, leave, message handling, ticking, and disposal.
- Supports both realtime and turn-based room execution models.
- Lets you replace the default WebSocket layer without rewriting game logic.

## Core Public Types

### `GameServer`

Creates and runs the runtime. You use it to:

- configure ports, tick rate, reconnect timing, and transport
- register room types with `defineRoom`
- attach plugins
- start and stop the server

Reference: [GameServer API](./api/gameserver.md)

### `Room<TState>`

Base class for your game logic. A room usually:

- initializes state in `onCreate`
- reacts to players joining in `onJoin`
- handles gameplay input in `onMessage`
- optionally updates every tick in `onTick`
- cleans up in `onDispose`

Reference: [Room Lifecycle API](./api/room-lifecycle.md)

### `PlayerContext`

Represents a connected player from room code. It gives you:

- `id` for player identity
- `sessionId` for the current transport session
- `metadata` for auth or profile data
- `send()` and `disconnect()` helpers

Reference: [Room Lifecycle API](./api/room-lifecycle.md#related-room-and-player-helpers)

### `Transport`

Defines how sessions connect, disconnect, and exchange protocol packets. The built-in transport is WebSocket, but you can supply your own implementation.

Reference: [Transport API](./api/transport.md)

## Typical Use Cases

- Realtime combat or action rooms using `engine: "realtime"` and `onTick(deltaTime)`
- Turn-based matches where each player action is processed through messages
- Lobby or queue rooms that mainly use `onJoin`, `onLeave`, and `broadcast`
- Server-side match orchestration with reconnect restoration and migration between rooms

## What This Package Does Not Try To Own

This framework gives you the room runtime and transport integration points. You still decide:

- how authentication tokens are issued
- how player data is stored
- how persistent progression or inventory is saved
- how matchmaking requests are initiated by your client

## Import Style

Import from the package root only:

```ts
import {
  GameServer,
  Room,
  PlayerContext,
  RoomContext,
  Plugin,
  Transport
} from "multiplayer_game_framework";
```

Deep imports are intentionally blocked so internal runtime details can evolve without breaking application code.

## Read Next

- Next: [Getting Started](./getting-started.md)
- See also: [Architecture](./architecture.md), [GameServer API](./api/gameserver.md), [Room Lifecycle API](./api/room-lifecycle.md)
