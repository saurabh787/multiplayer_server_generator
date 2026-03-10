# Documentation

This documentation is organized to take you from core concepts to API reference to production guidance.

## Recommended Reading Order

1. [Introduction](./introduction.md)
   What the framework is, which problems it solves, and the main public types.
2. [Getting Started](./getting-started.md)
   A minimal room, a running `GameServer`, and a quick explanation of the first lifecycle hooks you will use.
3. [Architecture](./architecture.md)
   The runtime model behind rooms, player membership, transport wiring, and error isolation.
4. API Reference
   [GameServer](./api/gameserver.md), [defineRoom](./api/defineRoom.md), [Room Lifecycle](./api/room-lifecycle.md), [Transport](./api/transport.md), [Matchmaking](./api/matchmaking.md)
5. Guides
   [Room Migration](./guides/room-migration.md), [Reconnect Handling](./guides/reconnect-handling.md), [Scaling Considerations](./guides/scaling-considerations.md)
6. Operations
   [Troubleshooting](./troubleshooting.md), [FAQ](./faq.md)
7. Project Review
   [Interview Preparation](./interview-prepration.md)

## Choose a Starting Point

- If you are new to the framework, start with [Getting Started](./getting-started.md).
- If you already have a room class and want exact hook behavior, jump to [Room Lifecycle API](./api/room-lifecycle.md).
- If you are wiring custom networking, read [Transport API](./api/transport.md).
- If you are preparing for production, read [Scaling Considerations](./guides/scaling-considerations.md) and [Troubleshooting](./troubleshooting.md).
- If you want a full project walkthrough for interviews or revision, read [Interview Preparation](./interview-prepration.md).

## Documentation Conventions

- "Room" means a server-side game instance that owns player membership and authoritative game state.
- "Realtime" means the room receives `onTick(deltaTime)` calls at a configured rate.
- "Turn" means room actions arrive through messages rather than a realtime tick loop.
- Cross-links point to the section where a concept is explained in more detail so you can move from example to reference quickly.
