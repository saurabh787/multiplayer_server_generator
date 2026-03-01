import { LoadClient } from "./_client";
import { withOptionalEmbeddedServer } from "./_runtime";
import { Opcode } from "../src/types/opcode";

async function main(): Promise<void> {
  const runtime = await withOptionalEmbeddedServer(3220, 3221);
  const a = new LoadClient(runtime.url);
  const b = new LoadClient(runtime.url);
  await a.waitOpen();
  await b.waitOpen();
  a.send(Opcode.AUTH, { protocolVersion: 1, token: "reconnect-user" });
  b.send(Opcode.AUTH, { protocolVersion: 1, token: "reconnect-peer" });
  const authA = await a.waitFor(Opcode.AUTH_OK);
  await b.waitFor(Opcode.AUTH_OK);
  a.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });
  b.send(Opcode.MATCH_JOIN, { mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });
  await a.waitFor(Opcode.MATCH_FOUND);
  await b.waitFor(Opcode.MATCH_FOUND);
  const joined = await a.waitFor(Opcode.ROOM_JOINED);
  a.close();

  await new Promise((r) => setTimeout(r, 1_000));
  const restored = new LoadClient(runtime.url);
  await restored.waitOpen();
  restored.send(Opcode.AUTH, { protocolVersion: 1, token: "reconnect-user" });
  const authRestored = await restored.waitFor(Opcode.AUTH_OK);
  // eslint-disable-next-line no-console
  console.log("[reconnect]", {
    beforePlayerId: authA.playerId,
    afterPlayerId: authRestored.playerId,
    roomId: joined.roomId,
    reconnected: authRestored.reconnected
  });
  restored.close();
  b.close();
  await runtime.stop();
}

void main();
