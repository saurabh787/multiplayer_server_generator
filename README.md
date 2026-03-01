# Multiplayer Framework (V1 Engine Core)

Authoritative multiplayer server core with:
- WebSocket transport (`ws`)
- MessagePack protocol (`1-byte opcode + payload`)
- Realtime and turn room engines
- FIFO matchmaking
- Plugin hooks
- Safety guards and graceful shutdown

## Quick Start

1. `npm install`
2. `npm run dev`
3. WebSocket endpoint: `ws://localhost:3000`
4. Metrics endpoint: `http://localhost:3001/metrics`

## Scripts

- `npm run dev`: run server from TypeScript
- `npm run build`: compile to `dist`
- `npm run start`: run compiled server
- `npm run test`: run unit + integration tests
- `npm run lint`: TypeScript type check
- `npm run simulate`: multiplayer simulation clients
- `npm run stress`: run stress against your running server (`ws://localhost:3000`, metrics at `:3001`)
- `npm run stress:embedded`: run stress with an internal temporary server (`ws://localhost:3210`, metrics `:3211`)
- `npm run soak:10m`: run 100-client 10-minute soak against external server (`ws://localhost:3000`)
- `npm run soak:10m:embedded`: run the same soak with embedded server mode
- `npm run stree`: alias to `npm run stress`
- `npm run test:reconnect`: reconnect smoke test
- `npm run test:memory`: memory soak monitor
- `npm run test:eventloop`: event loop lag monitor
- `npm run test:snapshot`: snapshot integrity monitor

## Protocol Contract

Packet format:
- byte `0`: opcode
- bytes `1..n`: MessagePack payload object

### Opcodes

- System: `1 AUTH`, `2 AUTH_OK`, `3 ERROR`, `4 PING`, `5 PONG`
- Matchmaking: `10 MATCH_JOIN`, `11 MATCH_FOUND`, `12 MATCH_CANCEL`
- Room: `20 ROOM_JOIN`, `21 ROOM_JOINED`, `22 ROOM_LEAVE`, `23 ROOM_PLAYER_JOIN`, `24 ROOM_PLAYER_LEAVE`
- Realtime: `30 INPUT`, `31 SNAPSHOT`
- Turn: `40 TURN_ACTION`, `41 TURN_RESULT`

### Standard Errors

- `1001 invalid_packet`
- `1002 unknown_opcode`
- `1003 not_authenticated`
- `1004 room_not_found`
- `1005 room_full`
- `1006 invalid_turn`

## Lifecycle

1. Connect
2. Send `AUTH` with `{ protocolVersion: 1 }`
3. Receive `AUTH_OK`
4. Send `MATCH_JOIN` or `ROOM_JOIN`
5. For realtime rooms, send `INPUT` and receive `SNAPSHOT`
6. For turn rooms, send `TURN_ACTION` and receive `TURN_RESULT`

## Folder Layout

- `src/protocol`: encode/decode and protocol guards
- `src/transport`: WebSocket transport + heartbeat + metrics endpoint
- `src/server`: main game server router and orchestration
- `src/room`: room abstractions, manager, sample rooms
- `src/engine`: realtime and turn engines
- `src/player`: session/player models
- `src/matchmaking`: queue-based matcher
- `src/plugins`: plugin contracts + logger/metrics plugins
- `tests`: unit and integration tests

## Extension Points

- Custom room factories via `GameServer` options:
  - `createRealtimeRoom`
  - `createTurnRoom`
- Plugin hooks via `PluginSystem` (`onConnect`, `onAuth`, `onRoomCreate`, `onInput`, `beforeSnapshot`, `afterSnapshot`, etc.)

## V1 Checklist

- [x] Protocol layer with max packet checks
- [x] Session/auth lifecycle
- [x] Room manager and lifecycle states
- [x] Realtime fixed-timestep engine
- [x] Turn action engine with turn validation
- [x] Matchmaking queue
- [x] Plugin system with error isolation
- [x] Graceful shutdown
- [x] Metrics endpoint
- [x] Unit + integration tests

## Validation Ladder (Requested Execution Order)

1. Unit foundation safety:
`npm run test` (covers protocol, opcode map, room transitions, matchmaking, rate limiting, snapshot builder)
2. Integration room/engine checks:
Included in `tests/room-engine.integration.test.ts` and `tests/integration.test.ts`
3. Multiplayer simulation:
`npm run simulate` (set `CLIENTS=100` for heavier run)
4. Stress tests:
`npm run stress`
If no external server is running, use `npm run stress:embedded`.
5. 10-minute soak:
`npm run soak:10m`
Artifacts generated in repo root:
- `telemetry.log` (JSONL every 5s)
- `slow-ticks.log` (JSONL slow tick events)
5. Reconnection:
`npm run test:reconnect`
6. Memory leak watch:
`npm run test:memory` for 30-60 minutes
7. Event loop lag:
`npm run test:eventloop`
8. Snapshot integrity:
`npm run test:snapshot`

JS SDK and Unity smoke tests are deferred because V1 scope explicitly excludes SDK delivery.

## Deferred (Post-V1)

- JS SDK packaging
- Unity SDK
- CLI scaffolding
- Delta compression/interpolation/prediction
- Multi-node/distributed room execution
