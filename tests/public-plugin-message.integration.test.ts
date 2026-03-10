import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import WebSocket from "ws";
import { GameServer } from "../src/public/game-server";
import { decodePacket, encodePacket } from "../src/protocol/protocol";
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
        close: async () => {
          if (ws.readyState === WebSocket.CLOSED) {
            return;
          }
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

test("public plugin can send transport-neutral message through PlayerContext.send", async () => {
  const basePort = 37_000 + Math.floor(Math.random() * 1_000);
  const server = new GameServer({
    config: {
      port: basePort,
      metricsPort: basePort + 1
    }
  });

  server.use({
    name: "welcome-plugin",
    onPlayerJoin: (_room, player) => {
      player.send("welcome", { playerId: player.id });
    }
  });

  let a: TestClient | undefined;
  let b: TestClient | undefined;
  let started = false;
  try {
    await server.start();
    started = true;
    a = await createClient(`ws://localhost:${basePort}`);
    b = await createClient(`ws://localhost:${basePort}`);

    a.send(Opcode.AUTH, { protocolVersion: 1 });
    b.send(Opcode.AUTH, { protocolVersion: 1 });
    await a.waitFor(Opcode.AUTH_OK);
    await b.waitFor(Opcode.AUTH_OK);

    a.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });
    b.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });

    const aMsg = await a.waitFor(Opcode.ROOM_MESSAGE, 5000);
    const bMsg = await b.waitFor(Opcode.ROOM_MESSAGE, 5000);

    assert.equal(aMsg.type, "welcome");
    assert.equal(bMsg.type, "welcome");
    assert.equal(typeof aMsg.payload, "object");
    assert.equal(typeof bMsg.payload, "object");
  } finally {
    await Promise.all([a?.close(), b?.close()].filter(Boolean) as Array<Promise<void>>);
    if (started) {
      await server.stop();
    }
  }
});
