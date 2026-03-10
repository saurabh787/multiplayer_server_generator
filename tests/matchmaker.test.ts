import test from "node:test";
import assert from "node:assert/strict";
import { Matchmaker } from "../src/matchmaking/matchmaker";
import { createPlayer } from "../src/player/player";

test("matchmaker forms FIFO groups correctly", () => {
  const mm = new Matchmaker();
  const p1 = createPlayer("p1", "s1");
  const p2 = createPlayer("p2", "s2");
  const p3 = createPlayer("p3", "s3");

  assert.equal(
    mm.enqueue({ player: p1, mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 }),
    undefined
  );
  const grouped = mm.enqueue({
    player: p2,
    mode: "realtime",
    roomType: "arena",
    requiredPlayers: 2,
    maxPlayers: 2
  });
  assert.ok(grouped);
  assert.deepEqual(grouped.players.map((p) => p.id), ["p1", "p2"]);

  assert.equal(
    mm.enqueue({ player: p3, mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 }),
    undefined
  );
});

test("matchmaker cancel removes queued player", () => {
  const mm = new Matchmaker();
  const p1 = createPlayer("p1", "s1");
  mm.enqueue({ player: p1, mode: "turn", roomType: "board", requiredPlayers: 2, maxPlayers: 2 });
  assert.equal(mm.cancel("p1"), true);
  assert.equal(mm.cancel("p1"), false);
});

test("matchmaker enqueue deduplicates player across queues", () => {
  const mm = new Matchmaker();
  const p1 = createPlayer("p1", "s1");
  const p2 = createPlayer("p2", "s2");

  mm.enqueue({ player: p1, mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });
  mm.enqueue({ player: p1, mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });

  const grouped = mm.enqueue({ player: p2, mode: "realtime", roomType: "arena", requiredPlayers: 2, maxPlayers: 2 });
  assert.ok(grouped);
  assert.deepEqual(grouped.players.map((p) => p.id), ["p1", "p2"]);

  mm.enqueue({ player: p1, mode: "turn", roomType: "board", requiredPlayers: 2, maxPlayers: 2 });
  assert.equal(mm.cancel("p1"), true);
  assert.equal(mm.cancel("p1"), false);
});
