# Interview Preparation

This document is a practical interview guide for the `multiplayer_game_framework` project. It explains what the system does, why it is designed this way, which methods are used for each major feature, which problems were solved in the runtime, and where the current limits still are.

## 1. Project Summary

This project is a server-authoritative multiplayer game framework built with:

- TypeScript
- Node.js 20+
- `ws` for WebSocket transport
- `@msgpack/msgpack` for compact binary payload encoding

Its main goal is to provide a reusable backend runtime for multiplayer games where the server owns the truth for:

- player identity
- room membership
- game state
- input acceptance
- room lifecycle

It supports two execution models:

- realtime rooms for fast ticking simulations
- turn rooms for action-by-action gameplay

## 2. What Problem This Project Solves

In multiplayer games, the hardest backend problems are usually:

- keeping all players on one authoritative state
- preventing clients from cheating by sending invalid state
- managing joins, leaves, room transitions, and reconnects
- keeping networking simple but efficient
- preventing one bad room or plugin from crashing the full server

This framework solves those problems by centralizing state and lifecycle management inside the server runtime instead of trusting clients.

## 3. Core Design Method

The main method used across the project is a server-authoritative room model.

That means:

- clients send intent, not truth
- the server validates the message
- the room applies game rules
- the room produces state updates or results
- clients render what the server accepted

This is the most important architecture decision in the project because it keeps room logic predictable and greatly reduces client-side divergence.

## 4. High-Level Architecture

The project is split into clear layers.

### Public API layer

This is the stable package surface exposed from `src/index.ts`.

Main public types:

- `GameServer`
- `Room`
- `PlayerContext`
- `RoomContext`
- `Transport`
- `Plugin`

Why this layer exists:

- application code only depends on a small stable API
- internal runtime code can evolve without breaking users
- it prevents unsafe deep imports into internal modules

### Core runtime layer

This is where orchestration happens:

- authentication
- matchmaking
- room creation
- room destruction
- reconnect handling
- metrics
- engine control

The main coordinator is the internal `GameServer` in `src/core/server/internal-server.ts`.

### Room layer

Rooms are the main domain unit in the framework.

A room owns:

- the players currently inside it
- the room mode (`realtime` or `turn`)
- the authoritative gameplay state
- join/leave/message/tick lifecycle hooks

### Engine layer

The project uses different engines for different game models:

- `RealtimeEngine` for fixed-rate ticking rooms
- `TurnEngine` for discrete action validation

### Transport layer

The default transport is WebSocket, but the transport is injectable through the public config contract.

### Protocol layer

Networking packets use:

- 1 byte opcode
- MsgPack object payload

This keeps packets small and structured.

### Plugin layer

Plugins add observability and extension points without forcing game code to depend on internal runtime objects.

## 5. How We Write the API

The public API is intentionally small and class-based.

### Room definition API

The main developer entry point is:

```ts
server.defineRoom("battle", BattleRoom, {
  engine: "realtime",
  maxClients: 8,
  autoDispose: true,
  tickRate: 30
});
```

Why this API works well:

- it is simple to explain
- it is easy to register multiple room types
- room options are explicit
- the room class contains the gameplay logic in one place

### Room lifecycle API

The `Room` class exposes:

- `onCreate`
- `onJoin`
- `onMessage`
- `onTick`
- `onLeave`
- `onDispose`

This lifecycle keeps responsibilities separated:

- initialization goes into `onCreate`
- player setup goes into `onJoin`
- gameplay input goes into `onMessage`
- simulation goes into `onTick`
- cleanup goes into `onLeave` and `onDispose`

### Helper methods

Public room code sends messages through helpers instead of touching sockets directly:

- `broadcast(...)`
- `send(...)`
- `disconnect(...)`

That is a good API design choice because room code stays independent from the actual networking library.

## 6. How Realtime Features Are Implemented

Realtime rooms use the `RealtimeEngine`.

Main method:

- fixed-step game loop
- accumulator-based timing
- catch-up cap of 5 simulation steps per loop
- one snapshot broadcast per tick

Why this method was chosen:

- fixed-step simulation is easier to reason about than variable timestep logic
- limiting catch-up steps prevents spiral-of-death behavior during lag spikes
- broadcasting snapshots from the authoritative server keeps all clients aligned

Realtime flow:

1. Player sends `INPUT`
2. Server rate-limits and validates it
3. Input is buffered on the player
4. Room logic reads and applies input during tick processing
5. Room builds a snapshot
6. Snapshot is sent to all players

Snapshot structure:

```ts
{
  t: tickNumber,
  r: roomId,
  s: state
}
```

## 7. How Turn-Based Features Are Implemented

Turn rooms use the `TurnEngine`.

Main method:

- no realtime tick loop
- actions are processed one by one
- current turn ownership is enforced

The engine checks:

- whether the acting player is the current turn owner
- whether the action can be processed
- what the next turn owner should be

After a valid action:

- the room computes the new state
- the engine rotates turn ownership
- `TURN_RESULT` is broadcast

Why this is useful:

- simpler logic for board and strategy games
- less CPU pressure than always-on ticking
- easier validation of ordered actions

## 8. How Matchmaking Works

The matchmaking system is queue-based and in-memory.

Queue key:

- mode
- room type
- required player count
- max player count

Players only match with players using identical queue settings.

Method used:

- enqueue requests into keyed FIFO queues
- when queue size reaches `requiredPlayers`, create a room
- join matched players into that room

Strengths:

- simple
- predictable
- easy to reason about

Current limitation:

- it is process-local
- it does not use external distributed coordination yet

## 9. How Room Membership Is Managed

One major runtime invariant is:

`A player can exist in exactly one active room at a time.`

This is handled by:

- detaching the player from the current room before joining another room
- processing leave logic before finalizing new membership
- logging an invariant violation if a player appears in multiple rooms

Why this matters:

- it avoids duplicated state updates
- it prevents conflicting room ownership
- it keeps gameplay logic much simpler

This is one of the most important correctness guarantees in the project.

## 10. How Reconnect Handling Works

Reconnect support is token-based.

Method used:

- client authenticates with `protocolVersion` and optional `token`
- on disconnect, the player is not removed immediately if a reconnect token exists
- the runtime starts a reconnect grace timer
- if the same token reconnects in time, the old player identity is rebound to the new session

What gets restored:

- player ID
- session binding
- room ID reference

Why this is important:

- temporary network drops do not always destroy player progress
- identity continuity is preserved for the duration of the grace period

Current limitation:

- reconnect state is in memory only
- a process restart would lose reconnect state

## 11. WebSocket Usage in Detail

WebSocket is the default transport because multiplayer game servers need low-latency, full-duplex communication with long-lived connections.

### Why WebSocket was chosen

- persistent connection
- low overhead compared to repeated HTTP polling
- good fit for realtime snapshots and game inputs
- supports server-to-client push naturally

### Connection flow

1. Client opens a WebSocket connection
2. Server creates a session with a generated session ID
3. Client must send `AUTH` before using gameplay features
4. Server validates protocol version
5. Server replies with `AUTH_OK`

Until authentication succeeds, non-auth packets are rejected.

### Packet format

Packets are binary.

Structure:

- first byte = opcode
- remaining bytes = MsgPack-encoded object payload

Why this is efficient:

- smaller than plain JSON text packets
- simple to parse
- explicit opcode handling keeps protocol dispatch fast

### Binary-only enforcement

The transport rejects non-binary or malformed messages.

This improves safety because:

- protocol parsing stays predictable
- invalid traffic is dropped early
- oversized payloads are blocked before they affect the room logic

### Opcode-based routing

Examples of important opcodes:

- `AUTH`
- `AUTH_OK`
- `ERROR`
- `PING`
- `PONG`
- `MATCH_JOIN`
- `MATCH_FOUND`
- `ROOM_JOIN`
- `ROOM_JOINED`
- `ROOM_MESSAGE`
- `INPUT`
- `SNAPSHOT`
- `TURN_ACTION`
- `TURN_RESULT`

This makes the protocol explicit and easy to test.

### Heartbeat and liveness

The transport sends heartbeat `PING` packets on an interval.

If the server does not see a fresh `PONG` within the configured session timeout window, it closes the socket.

This helps with:

- dead connection cleanup
- room membership cleanup
- resource control

### Backpressure handling

A slow client can become dangerous if outbound socket buffers grow forever.

Method used:

- before sending, the transport checks `socket.bufferedAmount`
- if buffered bytes exceed `maxBufferedAmountBytes`, the server disconnects that client

Why this is important:

- it protects the process from memory growth caused by slow receivers
- it prevents one lagging client from silently degrading the server

### Metrics endpoint

The WebSocket transport also starts a lightweight HTTP metrics endpoint on `metricsPort`.

That endpoint exposes runtime counters such as:

- sessions
- players
- rooms
- auth success count
- room joins/leaves
- input count
- snapshot count

### Transport abstraction

Even though WebSocket is the default, game code never talks to WebSocket directly.

The runtime uses a transport contract:

- `listen`
- `close`
- `send`
- `disconnect`
- optional `setBindings`

That means:

- the framework can support a different transport later
- room code remains unchanged
- transport-specific complexity stays isolated

## 12. How We Handle Bad or Malicious Traffic

This project has several protection layers.

### Protocol validation

The protocol rejects:

- empty packets
- oversized packets
- unknown opcodes
- malformed MsgPack payloads
- non-object payloads

### Authentication gate

Clients cannot use gameplay opcodes before authentication.

### Rate limiting

Realtime input uses a per-player rate window.

If a client exceeds `maxInputsPerSecond`, the input is ignored.

### Input buffer cap

Each player input buffer has a max size.

If the buffer is full, the oldest input is dropped before adding new input.

This avoids unbounded memory growth.

## 13. How We Handle Errors and Fault Isolation

One strong design decision in the project is fault isolation.

### Room errors

Room lifecycle execution is wrapped in safe invocation boundaries.

If room logic throws:

- the error is logged
- plugins are notified
- the room is destroyed instead of crashing the full server

### Plugin errors

Each plugin callback is also isolated with `try/catch`.

This means:

- a bad plugin does not break the runtime
- observability code cannot take down gameplay execution

### Slow tick detection

Realtime tick duration is measured.

If a tick exceeds `slowTickThresholdMs`:

- a slow tick event is emitted
- the event is logged
- plugins are notified

This is a practical way to detect overloaded room logic.

## 14. How We Keep the Code Efficient

Efficiency in this project comes more from disciplined design than from premature micro-optimization.

Main efficiency choices:

- binary WebSocket packets instead of text JSON transport
- MsgPack encoding for smaller payloads
- fixed-step simulation for stable realtime behavior
- capped catch-up loop to avoid runaway tick debt
- capped input buffers
- auto-disposal of empty rooms
- process-local in-memory room state for low access latency
- small public API to reduce complexity at the integration boundary

Code efficiency is also helped by separation of concerns:

- transport code does networking
- engine code does execution timing
- room code does gameplay
- plugin code does observability and extension

That separation reduces accidental coupling and keeps the runtime easier to maintain.

## 15. How We Observe the System

The project includes observability in two forms.

### Runtime metrics snapshot

The runtime tracks:

- active connections
- total accepted connections
- active authenticated connections
- rooms created and destroyed
- active room players
- total room joins and leaves
- inputs received
- snapshots sent

### Telemetry logging

The telemetry utility records:

- CPU estimate
- memory usage
- event loop lag
- GC activity
- tick timing

This is useful because Node.js multiplayer servers are sensitive to event loop lag and GC pressure.

### Slow tick log

Slow ticks are written to `slow-ticks.log`.

That gives a direct signal when room logic becomes too expensive.

## 16. Main Challenges in This Project and How We Tackled Them

### Challenge: keeping one player in one room only

Problem:

- during matchmaking or manual room joins, a player could otherwise end up referenced by two rooms

Solution:

- explicit detach-before-attach logic
- invariant check that logs if the rule is violated

### Challenge: handling temporary disconnects

Problem:

- network drops are common in real multiplayer scenarios

Solution:

- reconnect token
- reconnect grace timeout
- rebind existing player identity to the new session

### Challenge: preventing overloaded or abusive clients

Problem:

- too many messages or slow receivers can damage server stability

Solution:

- rate limiting
- input buffer caps
- max packet size checks
- backpressure-based disconnect

### Challenge: keeping realtime ticks stable

Problem:

- Node.js uses a single event loop, so slow synchronous work can delay all rooms

Solution:

- fixed-step loop
- catch-up cap
- slow tick measurement
- telemetry and log files for diagnosis

### Challenge: making the framework extensible without breaking users

Problem:

- multiplayer runtimes need internal evolution, but public API breakage is expensive

Solution:

- strict public API boundary
- public wrappers around internal runtime objects
- root-only exports

### Challenge: stopping one bad room or plugin from crashing the server

Problem:

- gameplay hooks are user-defined and error-prone

Solution:

- defensive `try/catch` boundaries
- room-level teardown on fatal room errors
- plugin error isolation

## 17. How We Scale

Current scaling model:

- single Node.js process
- in-memory room state
- each room has single-process authority

This is a strong fit for:

- prototypes
- small to medium multiplayer games
- low-latency authoritative room execution

### Vertical scaling approach

We improve single-process capacity by:

- reducing tick rates where possible
- keeping `onTick()` cheap
- keeping payloads compact
- auto-disposing empty rooms
- monitoring slow ticks and memory slope

### Horizontal scaling approach

The documented path is:

1. keep a room authoritative in one process only
2. shard room allocation across many processes
3. add external routing and discovery outside the room runtime

This is the correct scaling direction because distributed authority over the same room would greatly increase complexity and consistency risk.

### Current scaling limits

The framework does not yet provide:

- distributed matchmaking
- cross-process room migration
- persistent shared room state
- built-in load balancer coordination

So the current answer in an interview should be honest:

`The framework scales well inside a single process and is designed to shard by room across processes, but distributed coordination is still an external responsibility.`

## 18. Current Limitations and Honest Tradeoffs

This section is important for interview credibility.

### In-memory state

Fast and simple, but process restart loses room and reconnect state.

### Async room initialization caveat

`onCreate()` can return a promise, but the current public room host does not block room usage until that promise completes.

So:

- async setup errors are caught and logged
- but room authors should avoid assuming a fully awaited async boot phase today

### No delta compression

Snapshots are full payload envelopes, not delta patches.

That keeps the design simple but may increase bandwidth for large states.

### Simple matchmaking

The queue model is clean and predictable, but it does not yet include:

- skill matching
- latency region selection
- distributed queue coordination

### Event-loop sensitivity

Because this is a Node.js server, very heavy synchronous room logic can still impact runtime quality.

That is why the project includes slow tick monitoring and event loop telemetry.

## 19. Testing Strategy

The project uses:

- unit tests
- integration tests
- soak and diagnostic scripts

Areas covered by tests:

- protocol encode/decode validation
- unknown opcode rejection
- packet size enforcement
- rate limiter behavior
- backpressure threshold behavior
- realtime snapshot emission
- turn validation
- reconnect identity restoration
- public API room binding
- transport injection
- membership invariant correctness
- plugin hardening
- telemetry shape

This is important in interviews because it shows the project was validated at:

- protocol level
- runtime level
- API level
- operational level

## 20. Best Interview Talking Points

If asked for the strongest engineering points in this project, the best answers are:

- it uses a server-authoritative architecture to control correctness and reduce cheating
- it cleanly separates public API from internal runtime implementation
- it supports both realtime and turn-based multiplayer through separate engines
- it uses binary WebSocket + MsgPack packets for efficient transport
- it protects the process with protocol validation, rate limiting, input caps, and backpressure disconnects
- it isolates room and plugin failures instead of letting them crash the server
- it includes reconnect handling, metrics, telemetry, and slow tick logging
- it is built to scale by sharding rooms across processes, while keeping single-room authority simple

## 21. Fast Interview Questions and Answers

### Why did you choose a server-authoritative model?

Because multiplayer correctness is easier when the server owns state transitions, room membership, and input validation. It reduces cheating risk and keeps all clients aligned to one source of truth.

### Why use WebSocket instead of normal REST calls?

Gameplay traffic is bidirectional and continuous. WebSocket gives a persistent low-latency channel that is much better for snapshots, inputs, heartbeat checks, and reconnect-sensitive sessions.

### Why use MsgPack?

It keeps packets smaller than JSON while staying easy to encode and decode into structured objects.

### Why split realtime and turn engines?

Because those workloads are fundamentally different. Realtime benefits from fixed ticks, while turn games benefit from ordered action validation without constant ticking.

### How do you prevent one room from breaking the full server?

Room execution is wrapped in safe boundaries. If a room throws during lifecycle or tick processing, that room is torn down and the server keeps running.

### How do you prevent bad clients from hurting performance?

With protocol validation, auth gating, input rate limiting, packet size limits, input buffer caps, and backpressure-based disconnects.

### How do you handle reconnects?

The client authenticates with a token, the runtime keeps the player alive for a grace window after disconnect, and a reconnect with the same token rebinds the new session to the old player identity.

### How would you scale this system further?

I would keep each room authoritative on one process, shard room allocation across processes, and add external routing and matchmaking coordination. I would not try to make one room authoritative across many processes.

### What are the current weak points?

State is in memory, matchmaking is local to one process, snapshots are not delta-compressed, and async room boot is not fully awaited yet.

## 22. Final One-Minute Interview Summary

This project is a TypeScript server-authoritative multiplayer framework with a small public API and a room-based runtime. It uses WebSocket plus MsgPack for efficient low-latency communication, separates realtime and turn-based execution into different engines, and adds practical production protections like reconnect grace handling, input rate limiting, backpressure disconnects, metrics, telemetry, and slow tick logging. The system is strongest as a single-process authoritative runtime and is designed to scale horizontally by sharding rooms across processes while keeping one process authoritative per room.
