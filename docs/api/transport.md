# API: Transport

## Overview

The framework uses WebSocket transport by default.

You can inject a custom transport through `GameServer` config to integrate another networking layer while keeping room and gameplay logic unchanged. This is useful when you need custom session handling, protocol bridging, or infrastructure that does not use the default WebSocket server.

## Contract

```ts
interface Transport {
  setBindings?(
    config: Record<string, unknown>,
    events: {
      onConnect: (session: TransportSession) => void;
      onPacket: (session: TransportSession, opcode: number, payload: Record<string, unknown>) => void;
      onDisconnect: (session: TransportSession) => void;
    },
    metricsProvider: () => Record<string, unknown>
  ): void;

  listen(): Promise<void>;
  close(): Promise<void>;
  send(sessionId: string, opcode: number, payload: Record<string, unknown>): void;
  disconnect(sessionId: string): void;
}
```

## Required Methods

### `listen()`

Starts accepting sessions or packets from your transport layer.

Typical work:

- bind network listeners
- start your gateway or adapter
- make sure `onConnect` and `onPacket` can be triggered after startup

### `close()`

Stops the transport cleanly.

Typical work:

- stop accepting new sessions
- close underlying sockets or listeners
- release transport-owned resources

### `send(sessionId, opcode, payload)`

Encodes and sends a protocol packet to one session.

The framework calls this when room code uses messaging helpers or when protocol-level messages need to reach the client.

### `disconnect(sessionId)`

Terminates a specific session. The framework uses this for explicit disconnect flows and operational enforcement.

## Optional Method

### `setBindings(config, events, metricsProvider)`

Called so the runtime can hand the transport everything it needs to communicate with the server core.

Arguments:

- `config`: runtime configuration values
- `events`: callbacks your transport must call on connect, packet, and disconnect
- `metricsProvider`: function you can expose through your own health or metrics endpoint if useful

Implement this when your transport needs to store the event callbacks before `listen()` begins.

## `TransportSession`

A session contains runtime state such as:

- `id`
- `isAuthenticated`
- optional `playerId`
- optional `roomId`
- `protocolVersion`
- `lastPing`

Your transport should preserve and pass this session object back through lifecycle events so the runtime can track authentication and room membership correctly.

## Wiring Model

The ownership split is simple:

- the framework owns room logic, player membership, and protocol handling
- the transport owns connection I/O

Flow:

1. The server creates or receives a `Transport`.
2. The runtime binds `onConnect`, `onPacket`, and `onDisconnect`.
3. Your transport calls those callbacks as network events happen.
4. The runtime calls `send()` and `disconnect()` when outbound work is needed.

This separation is why room code does not change when transport changes.

## Example

```ts
import { GameServer, Transport, TransportEvents } from "multiplayer_game_framework";

class CustomTransport implements Transport {
  private events?: TransportEvents;

  public setBindings(
    _config: Record<string, unknown>,
    events: TransportEvents
  ): void {
    this.events = events;
  }

  public async listen(): Promise<void> {
    // start your network listener and call this.events?.onConnect(...)
  }

  public async close(): Promise<void> {
    // stop listener
  }

  public send(_sessionId: string, _opcode: number, _payload: Record<string, unknown>): void {
    // encode and send packet
  }

  public disconnect(_sessionId: string): void {
    // close session
  }
}

const server = new GameServer({
  config: {
    transport: new CustomTransport()
  }
});
```

## When To Build A Custom Transport

- You need to integrate with an existing gateway or edge service.
- You want to run the framework behind a protocol bridge.
- You need non-default connection ownership or deployment topology.

If WebSocket is fine for your application, prefer the built-in transport and keep complexity lower.

## Read Next

- Previous: [Room Lifecycle API](./room-lifecycle.md)
- Next: [Matchmaking API](./matchmaking.md)
- See also: [GameServer API](./gameserver.md), [Troubleshooting](../troubleshooting.md)
