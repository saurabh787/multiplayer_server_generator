import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import WebSocket from "ws";
import { GameServer } from "../src/server/game-server";
import { decodePacket, encodePacket } from "../src/protocol/protocol";
import { ErrorCode } from "../src/types/error-codes";
import { Opcode } from "../src/types/opcode";

function toBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.from(new Uint8Array(data));
}

interface TestClient {
  ws: WebSocket;
  close: () => Promise<void>;
  waitFor: (opcode: Opcode, timeoutMs?: number) => Promise<Record<string, unknown>>;
  send: (opcode: Opcode, payload: Record<string, unknown>) => void;
}

function createClient(url: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const queue: Array<{ opcode: number; payload: Record<string, unknown> }> = [];
    ws.on("open", () => {
      resolve({
        ws,
        close: async () => {
          ws.close();
          await once(ws, "close");
        },
        waitFor: async (opcode, timeoutMs = 3000) => {
          const start = Date.now();
          while (Date.now() - start < timeoutMs) {
            const item = queue.find((entry) => entry.opcode === opcode);
            if (item) {
              queue.splice(queue.indexOf(item), 1);
              return item.payload;
            }
            await new Promise((r) => setTimeout(r, 10));
          }
          throw new Error(`Timed out waiting for opcode ${opcode}`);
        },
        send: (opcode, payload) => ws.send(encodePacket(opcode, payload))
      });
    });
    ws.on("error", reject);
    ws.on("message", (data, isBinary) => {
      if (!isBinary || typeof data === "string") {
        return;
      }
      const packet = decodePacket(toBuffer(data), 8192);
      if (packet.opcode === Opcode.PING) {
        ws.send(encodePacket(Opcode.PONG, { ts: Date.now() }));
        return;
      }
      queue.push(packet);
    });
  });
}

test("integration: connect auth and matchmaking for realtime room", async () => {
  const server = new GameServer({
    config: {
      port: 3110,
      metricsPort: 3111,
      pingIntervalMs: 2000,
      sessionTimeoutMs: 10000
    }
  });
  await server.listen();
  const a = await createClient("ws://localhost:3110");
  const b = await createClient("ws://localhost:3110");

  a.send(Opcode.AUTH, { protocolVersion: 1 });
  b.send(Opcode.AUTH, { protocolVersion: 1 });
  await a.waitFor(Opcode.AUTH_OK);
  await b.waitFor(Opcode.AUTH_OK);

  a.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });
  b.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });

  await a.waitFor(Opcode.MATCH_FOUND);
  await b.waitFor(Opcode.MATCH_FOUND);
  await a.waitFor(Opcode.ROOM_JOINED);
  await b.waitFor(Opcode.ROOM_JOINED);

  a.send(Opcode.INPUT, { tick: 1, input: { dx: 1, dy: 1 } });
  const snapshot = await a.waitFor(Opcode.SNAPSHOT, 5000);
  assert.ok(typeof snapshot.t === "number");

  await Promise.all([a.close(), b.close()]);
  await server.shutdown();
});

test("integration: turn room rejects out-of-turn action", async () => {
  const server = new GameServer({
    config: {
      port: 3120,
      metricsPort: 3121,
      pingIntervalMs: 2000,
      sessionTimeoutMs: 10000
    }
  });
  await server.listen();
  const a = await createClient("ws://localhost:3120");
  const b = await createClient("ws://localhost:3120");
  a.send(Opcode.AUTH, { protocolVersion: 1 });
  b.send(Opcode.AUTH, { protocolVersion: 1 });
  await a.waitFor(Opcode.AUTH_OK);
  await b.waitFor(Opcode.AUTH_OK);
  a.send(Opcode.MATCH_JOIN, { mode: "turn", roomType: "board", requiredPlayers: 2, maxPlayers: 2 });
  b.send(Opcode.MATCH_JOIN, { mode: "turn", roomType: "board", requiredPlayers: 2, maxPlayers: 2 });
  await a.waitFor(Opcode.MATCH_FOUND);
  await b.waitFor(Opcode.MATCH_FOUND);

  b.send(Opcode.TURN_ACTION, { action: 42 });
  const err = await b.waitFor(Opcode.ERROR, 3000);
  assert.equal(err.code, ErrorCode.INVALID_TURN);

  await Promise.all([a.close(), b.close()]);
  await server.shutdown();
});

test("integration: malformed binary closes connection", async () => {
  const server = new GameServer({
    config: {
      port: 3130,
      metricsPort: 3131
    }
  });
  await server.listen();
  const ws = new WebSocket("ws://localhost:3130");
  await once(ws, "open");
  ws.send(Buffer.from([255, 0, 0]));
  await once(ws, "close");
  await server.shutdown();
});

test("integration: reconnect within grace period restores player identity", async () => {
  const server = new GameServer({
    config: {
      port: 3140,
      metricsPort: 3141,
      reconnectGraceMs: 4_000
    }
  });
  await server.listen();

  const a = await createClient("ws://localhost:3140");
  const b = await createClient("ws://localhost:3140");
  a.send(Opcode.AUTH, { protocolVersion: 1, token: "user-a" });
  b.send(Opcode.AUTH, { protocolVersion: 1, token: "user-b" });
  const authA = await a.waitFor(Opcode.AUTH_OK);
  await b.waitFor(Opcode.AUTH_OK);

  a.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });
  b.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });
  await a.waitFor(Opcode.MATCH_FOUND);
  await b.waitFor(Opcode.MATCH_FOUND);
  const roomJoined = await a.waitFor(Opcode.ROOM_JOINED);
  assert.ok(roomJoined.roomId);
  await a.close();

  const aReconnect = await createClient("ws://localhost:3140");
  aReconnect.send(Opcode.AUTH, { protocolVersion: 1, token: "user-a" });
  const authReconnected = await aReconnect.waitFor(Opcode.AUTH_OK);
  assert.equal(authReconnected.playerId, authA.playerId);
  assert.equal(authReconnected.reconnected, true);
  assert.equal(authReconnected.roomId, roomJoined.roomId);

  const metrics = server.metrics() as { players: number };
  assert.equal(metrics.players, 2);

  await Promise.all([aReconnect.close(), b.close()]);
  await server.shutdown();
});
