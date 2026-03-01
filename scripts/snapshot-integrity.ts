import { LoadClient } from "./_client";
import { withOptionalEmbeddedServer } from "./_runtime";
import { Opcode } from "../src/types/opcode";
import { TickIntegrityGuard } from "../src/room/snapshot-builder";

async function main(): Promise<void> {
  const runtime = await withOptionalEmbeddedServer(3240, 3241);
  const a = new LoadClient(runtime.url);
  const b = new LoadClient(runtime.url);
  await a.waitOpen();
  await b.waitOpen();
  a.send(Opcode.AUTH, { protocolVersion: 1, token: "snap-a" });
  b.send(Opcode.AUTH, { protocolVersion: 1, token: "snap-b" });
  await a.waitFor(Opcode.AUTH_OK);
  await b.waitFor(Opcode.AUTH_OK);
  a.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "integrity", requiredPlayers: 2, maxPlayers: 2 });
  b.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "integrity", requiredPlayers: 2, maxPlayers: 2 });
  await a.waitFor(Opcode.MATCH_FOUND);
  await b.waitFor(Opcode.MATCH_FOUND);

  const guard = new TickIntegrityGuard();
  const seenEntityIds = new Set<string>();

  setInterval(() => {
    a.send(Opcode.INPUT, { tick: Date.now(), input: { dx: 1 } });
  }, 50);

  setInterval(() => {
    const queue = a.getQueue();
    for (const item of queue) {
      if (item.opcode !== Opcode.SNAPSHOT) {
        continue;
      }
      const tick = Number(item.payload.t);
      guard.assertIncreasing(tick);
      const state = item.payload.s as { players?: Array<{ id: string }> };
      const ids = (state.players ?? []).map((p) => p.id);
      const idSet = new Set(ids);
      if (idSet.size !== ids.length) {
        throw new Error("Duplicate entities in snapshot");
      }
      for (const id of ids) {
        seenEntityIds.add(id);
      }
    }
    queue.length = 0;
    // eslint-disable-next-line no-console
    console.log(`[snapshot-integrity] uniqueEntities=${seenEntityIds.size}`);
  }, 1_000);

  process.on("SIGINT", () => {
    a.close();
    b.close();
    void runtime.stop().then(() => process.exit(0));
  });
}

void main();
