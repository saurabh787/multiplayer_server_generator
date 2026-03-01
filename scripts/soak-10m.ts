import { LoadClient } from "./_client";
import { withOptionalEmbeddedServer } from "./_runtime";
import { Opcode } from "../src/types/opcode";

const DEFAULT_CLIENTS = 100;
const DEFAULT_DURATION_MS = 10 * 60 * 1000;
const INPUT_INTERVAL_MS = 30;
const PROGRESS_INTERVAL_MS = 30 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const durationMs = Number(process.env.SOAK_DURATION_MS ?? DEFAULT_DURATION_MS);
  const totalClients = Number(process.env.SOAK_CLIENTS ?? DEFAULT_CLIENTS);
  const runtime = await withOptionalEmbeddedServer(3260, 3261);

  // eslint-disable-next-line no-console
  console.log(
    `[soak] started target=${runtime.url} clients=${totalClients} durationMs=${durationMs} mode=${
      process.env.USE_EMBEDDED_SERVER === "1" ? "embedded" : "external"
    }`
  );

  const clients = Array.from({ length: totalClients }, () => new LoadClient(runtime.url));
  const startedAt = Date.now();
  let inputSent = 0;

  for (let i = 0; i < clients.length; i += 1) {
    const client = clients[i];
    await client.waitOpen();
    client.send(Opcode.AUTH, { protocolVersion: 1, token: `soak-${i}` });
    await client.waitFor(Opcode.AUTH_OK);
    client.send(Opcode.MATCH_JOIN, {
      mode: "realtime",
      roomType: "soak-10m",
      requiredPlayers: 10,
      maxPlayers: 12
    });
  }

  // eslint-disable-next-line no-console
  console.log("[soak] all clients authenticated and enqueued");

  const inputTimer = setInterval(() => {
    for (const client of clients) {
      if (client.isClosed()) {
        continue;
      }
      client.send(Opcode.INPUT, {
        tick: Date.now(),
        input: {
          dx: Math.random() > 0.5 ? 1 : -1,
          dy: Math.random() > 0.5 ? 1 : -1
        }
      });
      inputSent += 1;
    }
  }, INPUT_INTERVAL_MS);

  const progressTimer = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    // eslint-disable-next-line no-console
    console.log(`[soak] progress elapsedSec=${elapsedSec} inputSent=${inputSent}`);
  }, PROGRESS_INTERVAL_MS);

  try {
    await sleep(durationMs);
    // eslint-disable-next-line no-console
    console.log("[soak] duration reached, shutting down clients...");
  } finally {
    clearInterval(inputTimer);
    clearInterval(progressTimer);
    for (const client of clients) {
      client.close();
    }
    await sleep(1000);
    await runtime.stop();
  }

  // eslint-disable-next-line no-console
  console.log("[soak] completed");
}

void main();
