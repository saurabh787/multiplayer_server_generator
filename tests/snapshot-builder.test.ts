import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, TickIntegrityGuard } from "../src/room/snapshot-builder";

test("snapshot builder envelopes tick, room and state", () => {
  const s = buildSnapshot(7, "room-a", { players: [{ id: "p1" }] });
  assert.equal(s.t, 7);
  assert.equal(s.r, "room-a");
  assert.deepEqual(s.s, { players: [{ id: "p1" }] });
});

test("tick integrity guard rejects non-increasing ticks", () => {
  const guard = new TickIntegrityGuard();
  guard.assertIncreasing(1);
  guard.assertIncreasing(2);
  assert.throws(() => guard.assertIncreasing(2));
});
