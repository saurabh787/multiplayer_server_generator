import test from "node:test";
import assert from "node:assert/strict";
import { RealtimeEngine, SlowTickEvent } from "../src/engine/realtime-engine";
import { createPlayer } from "../src/player/player";
import { PluginSystem } from "../src/plugins/plugin-system";
import { RealtimeRoom } from "../src/room/realtime-room";

class SlowRoom extends RealtimeRoom {
  public constructor() {
    super("slow-room", "test", 2, new PluginSystem(), { sendToSession: () => {} });
  }

  public onTick(): void {
    const end = Date.now() + 3;
    while (Date.now() < end) {
      // deliberate sync work for threshold crossing
    }
  }

  public getSnapshot(): Record<string, unknown> {
    return {};
  }
}

test("slow tick callback invoked only above threshold", async () => {
  const events: SlowTickEvent[] = [];
  const room = new SlowRoom();
  room.addPlayer(createPlayer("p1", "s1"));
  const engine = new RealtimeEngine(room, new PluginSystem(), {
    tickRate: 20,
    slowTickThresholdMs: 1,
    onSlowTick: (event) => events.push(event)
  });
  room.attachEngine(engine);
  room.start();
  await new Promise((r) => setTimeout(r, 120));
  room.stop();

  assert.ok(events.length > 0);
  assert.equal(events.every((event) => event.durationMs > event.thresholdMs), true);
  assert.equal(events.every((event) => event.roomId === "slow-room"), true);
});
