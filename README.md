# multiplayer_game_framework

A server-authoritative multiplayer game framework for fast 2D and session-based games.
It gives you room lifecycle control, built-in matchmaking, reconnect identity restoration, and transport injection.
The public API is intentionally small: define rooms, start the server, and handle player messages.
Internal/runtime modules are boundary-locked so integrations stay stable at the package root.

## Why Use It

- Server-authoritative architecture
- `defineRoom` API with lifecycle hooks
- Swappable transport layer
- Auto room disposal
- Matchmaking queue
- Reconnect identity restoration
- Lifecycle hooks for room behavior
- Hardening validated with soak and integration tests

## Installation

```bash
npm install multiplayer_game_framework
```

## 2-Minute Quick Start

```ts
import { GameServer, Room, PlayerContext } from "multiplayer_game_framework";

class BattleRoom extends Room<{ moves: number }> {
  public onCreate(): void {
    this.state = { moves: 0 };
  }

  public onJoin(player: PlayerContext): void {
    this.send(player, "welcome", { id: player.id });
  }

  public onMessage(player: PlayerContext, type: string, _payload: unknown): void {
    if (type !== "move") return;
    this.state.moves += 1;
    this.send(player, "moved", { moves: this.state.moves });
  }
}

const server = new GameServer({
  config: { port: 3000, tickRate: 20 }
});

server.defineRoom("battle", BattleRoom, {
  engine: "realtime",
  maxClients: 8,
  autoDispose: true
});

await server.start();
```

## Minimal Usage Example

```ts
import { GameServer, Room, PlayerContext } from "multiplayer_game_framework";

class PingRoom extends Room<{ pings: number }> {
  public onCreate(): void {
    this.state = { pings: 0 };
  }

  public onMessage(_player: PlayerContext, type: string, _payload: unknown): void {
    if (type === "ping") {
      this.state.pings += 1;
      this.broadcast("pong", { total: this.state.pings });
    }
  }
}

const server = new GameServer();
server.defineRoom("ping", PingRoom, { maxClients: 16, autoDispose: true });
await server.start();
```

## Full Documentation

- Full Documentation: [`/docs`](./docs)
- Start here: [Introduction](./docs/introduction.md)
- Quick setup: [Getting Started](./docs/getting-started.md)
- System design: [Architecture](./docs/architecture.md)
- API reference: [docs/api](./docs/api)
- Practical guides: [docs/guides](./docs/guides)
- Debugging: [Troubleshooting](./docs/troubleshooting.md)
