import { LoadClient } from "./_client";
import { withOptionalEmbeddedServer } from "./_runtime";
import { Opcode } from "../src/types/opcode";

const CLIENTS = Number(process.env.CLIENTS ?? 30);

async function main(): Promise<void> {
  const runtime = await withOptionalEmbeddedServer(3230, 3231);
  const clients = Array.from({ length: CLIENTS }, () => new LoadClient(runtime.url));
  for (let i = 0; i < clients.length; i += 1) {
    const c = clients[i];
    await c.waitOpen();
    c.send(Opcode.AUTH, { protocolVersion: 1, token: `soak-${i}` });
    await c.waitFor(Opcode.AUTH_OK);
    c.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "soak", requiredPlayers: 2, maxPlayers: 8 });
  }

  setInterval(() => {
    for (const c of clients) {
      c.send(Opcode.INPUT, { tick: Date.now(), input: { dx: Math.random() > 0.5 ? 1 : -1 } });
    }
  }, 40);

  setInterval(() => {
    const heapMB = process.memoryUsage().heapUsed / 1024 / 1024;
    // eslint-disable-next-line no-console
    console.log(`[memory-soak] heapUsedMB=${heapMB.toFixed(2)} clients=${CLIENTS}`);
  }, 5_000);

  process.on("SIGINT", () => {
    for (const c of clients) {
      c.close();
    }
    void runtime.stop().then(() => process.exit(0));
  });
}

void main();
