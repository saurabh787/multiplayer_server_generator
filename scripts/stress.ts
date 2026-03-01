import { LoadClient } from "./_client";
import { withOptionalEmbeddedServer } from "./_runtime";
import { Opcode } from "../src/types/opcode";

async function inputFlood(client: LoadClient): Promise<void> {
  let sent = 0;
  const timer = setInterval(() => {
    for (let i = 0; i < 10; i += 1) {
      client.send(Opcode.INPUT, { tick: Date.now(), input: { dx: i } });
      sent += 1;
    }
  }, 20);
  await new Promise((r) => setTimeout(r, 5_000));
  clearInterval(timer);
  // eslint-disable-next-line no-console
  console.log(`[stress] inputFlood sent=${sent}`);
}

async function roomExplosion(url: string, totalClients = 80): Promise<void> {
  const clients = Array.from({ length: totalClients }, () => new LoadClient(url));
  for (let i = 0; i < clients.length; i += 1) {
    const c = clients[i];
    await c.waitOpen();
    c.send(Opcode.AUTH, { protocolVersion: 1, token: `room-exp-${i}` });
    await c.waitFor(Opcode.AUTH_OK);
    c.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: `r-${Math.floor(i / 8)}`, requiredPlayers: 2, maxPlayers: 8 });
  }
  await new Promise((r) => setTimeout(r, 3_000));
  const mem = process.memoryUsage();
  // eslint-disable-next-line no-console
  console.log(`[stress] roomExplosion clients=${totalClients} heapMB=${(mem.heapUsed / 1024 / 1024).toFixed(2)}`);
  for (const c of clients) {
    c.close();
  }
}

async function largeSnapshotScenario(clientA: LoadClient, clientB: LoadClient): Promise<void> {
  clientA.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "large-snapshot", requiredPlayers: 2, maxPlayers: 2 });
  clientB.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "large-snapshot", requiredPlayers: 2, maxPlayers: 2 });
  await clientA.waitFor(Opcode.MATCH_FOUND);
  await clientB.waitFor(Opcode.MATCH_FOUND);
  for (let i = 0; i < 220; i += 1) {
    clientA.send(Opcode.INPUT, { tick: i, input: { dx: 1, ent: i } });
  }
  await new Promise((r) => setTimeout(r, 1_000));
  // eslint-disable-next-line no-console
  console.log("[stress] largeSnapshot scenario completed");
}

async function main(): Promise<void> {
  const runtime = await withOptionalEmbeddedServer(3210, 3211);
  // eslint-disable-next-line no-console
  console.log(
    `[stress] target=${runtime.url} mode=${
      process.env.USE_EMBEDDED_SERVER === "1" ? "embedded" : "external"
    } metrics=${process.env.USE_EMBEDDED_SERVER === "1" ? "http://localhost:3211/metrics" : "http://localhost:3001/metrics"}`
  );
  const a = new LoadClient(runtime.url);
  const b = new LoadClient(runtime.url);
  await a.waitOpen();
  await b.waitOpen();
  a.send(Opcode.AUTH, { protocolVersion: 1, token: "stress-a" });
  b.send(Opcode.AUTH, { protocolVersion: 1, token: "stress-b" });
  await a.waitFor(Opcode.AUTH_OK);
  await b.waitFor(Opcode.AUTH_OK);

  await inputFlood(a);
  await largeSnapshotScenario(a, b);
  await roomExplosion(runtime.url);
  a.close();
  b.close();
  await runtime.stop();
}

void main();
