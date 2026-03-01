# Multiplayer Framework V1 Plan (Engine Core First)

## Summary
Build the project in sequenced chunks from zero to a production-safe core engine, using:
- `MessagePack + 1-byte opcode` protocol
- `single-package repo` initially
- `engine core only` for V1 (SDK/CLI deferred)

The implementation will be phase-gated: each phase must pass explicit acceptance tests before moving forward.

## Scope Lock
In scope for V1:
1. WebSocket transport
2. Session/auth lifecycle
3. Room system
4. Realtime engine (fixed timestep)
5. Turn engine
6. Matchmaking queue
7. Plugin system
8. Safety, error handling, graceful shutdown
9. Metrics/logging basics

Out of scope for V1:
1. Unity SDK
2. JS SDK packaging
3. CLI scaffolder
4. Distributed multi-node scaling
5. Delta compression/interpolation/prediction

## Phase Breakdown (Execution Chunks)

### Phase 0: Project Bootstrap
1. Create TypeScript Node baseline in current repo.
2. Add folders: `src/server`, `src/transport`, `src/protocol`, `src/room`, `src/engine`, `src/player`, `src/matchmaking`, `src/plugins`, `src/types`.
3. Add scripts: `build`, `dev`, `start`, `test`, `lint`.
4. Add config for strict TS compilation.

Exit criteria:
1. `npm run build` passes.
2. Empty server process starts without runtime errors.

### Phase 1: Contract Lock (Code-Level Types)
1. Define core types/interfaces before implementation.
2. Lock lifecycle enums and error codes.
3. Freeze opcode map and payload contracts.

Exit criteria:
1. All core interfaces compile.
2. No `any` in public contracts.

### Phase 2: Protocol + Transport + Session
1. Implement protocol encoder/decoder: `[opcode:1 byte][payload:msgpack]`.
2. Add packet size limit (default `8192` bytes).
3. Implement WebSocket transport wrapper:
   - binary-only
   - decode guard rails
   - heartbeat PING/PONG
   - disconnect handling
4. Implement `Session` model with auth gate and protocol version check.

Exit criteria:
1. Valid packet roundtrip works.
2. Malformed/oversized packet closes connection.
3. Unauthenticated session cannot access room/match ops.

### Phase 3: GameServer Router + Room Manager
1. Implement `GameServer` orchestration:
   - session registry
   - opcode routing
   - plugin hook dispatch
2. Implement `RoomManager`:
   - create/get/destroy room
   - cleanup guarantees
3. Add base error response pipeline with standardized codes.

Exit criteria:
1. Opcode routing table complete.
2. Room create/destroy leaves no stale references.

### Phase 4: Room Abstractions + Engines
1. Implement `BaseRoom` contract:
   - player map, add/remove, broadcast/send
   - `pendingRemovals`
   - room states (`active`, `closing`, `destroyed`)
2. Implement `RealtimeEngine`:
   - fixed timestep (20 Hz default)
   - guarded tick execution
   - input buffer processing
   - snapshot broadcast
3. Implement `TurnEngine`:
   - turn ownership validation
   - action processing
   - turn result broadcast

Exit criteria:
1. Realtime room produces stable snapshots under normal load.
2. Turn room rejects out-of-turn actions deterministically.
3. Engine exceptions are contained to room scope.

### Phase 5: Matchmaking + Plugins
1. Implement simple FIFO match queue by mode/type.
2. Auto-create room when threshold players reached.
3. Implement plugin system:
   - global hooks
   - room hooks
   - plugin error isolation
4. Add default plugins: logger + lightweight metrics collector.

Exit criteria:
1. Matchmaking reliably forms rooms.
2. Plugin failure does not crash server/room.

### Phase 6: Hardening + Observability
1. Add input flood protection:
   - per-session/per-player rate limit
   - per-room queue cap
2. Add CPU guardrails:
   - tick duration measurement
   - slow-room warnings
3. Add room lifecycle cleanup:
   - engine stop
   - timers cleared
   - player refs removed
4. Add graceful shutdown:
   - stop new connections
   - close rooms cleanly
   - close transport
5. Add `/metrics` JSON endpoint (basic counters/histograms).

Exit criteria:
1. Stress misuse does not crash process.
2. Shutdown path completes cleanly without hanging rooms.

### Phase 7: Validation + Documentation
1. Add integration test harness with Node test clients.
2. Write operator/developer docs:
   - protocol contracts
   - lifecycle flow
   - extension points
3. Publish “V1 done” checklist and deferred roadmap.

Exit criteria:
1. All required tests green.
2. README includes runbook + extension instructions.

## Public APIs / Interfaces / Types (Locked for V1)
1. `Opcode` enum
   - System: `AUTH`, `AUTH_OK`, `ERROR`, `PING`, `PONG`
   - Match: `MATCH_JOIN`, `MATCH_FOUND`, `MATCH_CANCEL`
   - Room: `ROOM_JOIN`, `ROOM_JOINED`, `ROOM_LEAVE`, `ROOM_PLAYER_JOIN`, `ROOM_PLAYER_LEAVE`
   - Realtime: `INPUT`, `SNAPSHOT`
   - Turn: `TURN_ACTION`, `TURN_RESULT`
2. `Session`
   - `id`, `socket`, `isAuthenticated`, `playerId?`, `protocolVersion`, `lastPing`, `connectedAt`
3. `Player`
   - `id`, `roomId?`, `metadata`, `inputBuffer`, `inputCountWindow`, `connectedAt`
4. `BaseRoom` abstract methods
   - `onInit`, `onPlayerJoin`, `onPlayerLeave`, `onInput`, `onDestroy`
5. `RealtimeRoom` extensions
   - `onTick(deltaMs)`, `getSnapshot()`
6. `TurnRoom` extensions
   - `onTurn(player, action)`, `getState()`
7. Packet payload contracts
   - `AUTH`: `{ token?: string, protocolVersion: number }`
   - `INPUT`: `{ tick: number, input: object }`
   - `SNAPSHOT`: `{ t: number, r: string, s: object }`
   - `TURN_ACTION`: `{ action: number, data?: object }`
   - `TURN_RESULT`: `{ playerId: string, action: number, state: object }`
8. Error codes
   - `1001 invalid_packet`, `1002 unknown_opcode`, `1003 not_authenticated`, `1004 room_not_found`, `1005 room_full`, `1006 invalid_turn`

## Test Cases and Scenarios

### Unit
1. Protocol encode/decode symmetry.
2. Unknown opcode rejection.
3. Oversized packet rejection.
4. Malformed MessagePack handling.

### Integration
1. Connect -> AUTH -> join matchmaking -> room assigned.
2. Realtime flow: input accepted, snapshot emitted each tick.
3. Turn flow: valid action accepted, invalid-turn rejected.
4. Disconnect mid-room handled safely.
5. Plugin exception isolation.

### Reliability
1. Input spam test with enforced drops.
2. Slow tick simulation logs warnings.
3. Room crash simulation destroys only affected room.
4. Graceful shutdown with active rooms.

### Acceptance
1. Supports both realtime and turn room modes end-to-end.
2. No process crash from malformed client traffic.
3. Clean room/session teardown without leaks in basic soak test.

## Assumptions and Defaults
1. Runtime: Node LTS + TypeScript strict mode.
2. Transport: WebSocket (`ws`) only for V1.
3. Max packet size default: `8KB` (configurable).
4. Realtime tick rate default: `20Hz` (configurable).
5. Matchmaking: FIFO, no MMR/region/party logic.
6. Auth: token check stub/simple validator in V1.
7. Single-process room execution only in V1.
8. SDK/CLI/framework-style file routing deferred to post-V1 phases.
