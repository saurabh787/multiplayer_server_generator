import test from "node:test";
import assert from "node:assert/strict";
import { RealtimeEngine } from "../src/engine/realtime-engine";
import { createPlayer } from "../src/player/player";
import { PluginSystem } from "../src/plugins/plugin-system";
import { RealtimeRoom } from "../src/room/realtime-room";

class ThrowOnJoinRoom extends RealtimeRoom {
  public constructor() {
    super("throw-room", "test", 2, new PluginSystem(), { sendToSession: () => {} });
  }

  public onPlayerJoin(): void {
    throw new Error("join failure");
  }

  public onTick(): void {}

  public getSnapshot(): Record<string, unknown> {
    return {};
  }
}

class CountingRoom extends RealtimeRoom {
  public ticks = 0;

  public constructor() {
    super("count-room", "test", 2, new PluginSystem(), { sendToSession: () => {} });
  }

  public onTick(): void {
    this.ticks += 1;
  }

  public getSnapshot(): Record<string, unknown> {
    return { ticks: this.ticks };
  }
}

test("room lifecycle hook errors are isolated and room is disposed", () => {
  const room = new ThrowOnJoinRoom();
  const player = createPlayer("p1", "s1");

  const joined = room.addPlayer(player);
  assert.equal(joined, false);
  assert.equal(room.state, "destroyed");
  assert.equal(room.players.size, 0);
});

test("realtime engine does not tick after room disposal", async () => {
  const room = new CountingRoom();
  room.addPlayer(createPlayer("p1", "s1"));
  const engine = new RealtimeEngine(room, new PluginSystem(), {
    tickRate: 40,
    slowTickThresholdMs: 100
  });
  room.attachEngine(engine);
  room.start();

  await new Promise((r) => setTimeout(r, 80));
  room.destroy();
  const ticksAtDestroy = room.ticks;
  await new Promise((r) => setTimeout(r, 80));

  assert.equal(room.state, "destroyed");
  assert.equal(room.ticks, ticksAtDestroy);
});
