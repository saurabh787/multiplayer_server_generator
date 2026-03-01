import { LoadClient } from "./_client";
import { withOptionalEmbeddedServer } from "./_runtime";
import { Opcode } from "../src/types/opcode";

const CLIENTS = Number(process.env.CLIENTS ?? 50);

async function main(): Promise<void> {
  const runtime = await withOptionalEmbeddedServer(3200, 3201);
  const clients = Array.from({ length: CLIENTS }, () => new LoadClient(runtime.url));
  const latencies: number[] = [];

  for (let i = 0; i < clients.length; i += 1) {
    const client = clients[i];
    await client.waitOpen();
    client.send(Opcode.AUTH, { protocolVersion: 1, token: `sim-${i}` });
    await client.waitFor(Opcode.AUTH_OK);
    client.send(Opcode.MATCH_JOIN, {
      mode: "realtime",
      roomType: "arena",
      requiredPlayers: 2,
      maxPlayers: 8
    });
  }

  for (const client of clients) {
    setInterval(() => {
      const sent = Date.now();
      client.send(Opcode.INPUT, {
        tick: sent,
        input: { dx: Math.random() > 0.5 ? 1 : -1, dy: 0 }
      });
    }, 30);
  }

  setInterval(() => {
    let snapshotCount = 0;
    for (const client of clients) {
      const queue = client.getQueue();
      for (const item of queue) {
        if (item.opcode !== Opcode.SNAPSHOT) {
          continue;
        }
        snapshotCount += 1;
        const tick = Number(item.payload.t);
        if (Number.isFinite(tick)) {
          latencies.push(Math.max(0, Date.now() - tick));
        }
      }
      queue.length = 0;
    }
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    // eslint-disable-next-line no-console
    console.log(`[simulate] clients=${CLIENTS} snapshots=${snapshotCount} avgLatencyMs=${avgLatency.toFixed(2)}`);
    latencies.length = 0;
  }, 2_000);

  process.on("SIGINT", () => {
    for (const c of clients) {
      c.close();
    }
    void runtime.stop().then(() => process.exit(0));
  });
}

void main();
