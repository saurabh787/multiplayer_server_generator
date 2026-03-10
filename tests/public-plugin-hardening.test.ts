import test from "node:test";
import assert from "node:assert/strict";
import { adaptPublicPlugin } from "../src/core/plugins/public-plugin-adapter";
import { PluginSystem } from "../src/plugins/plugin-system";
import { RealtimeRoom } from "../src/room/realtime-room";

class AdapterRoom extends RealtimeRoom {
  public constructor() {
    super("adapter-room", "test", 2, new PluginSystem(), { sendToSession: () => {} });
  }

  public onTick(): void {}

  public getSnapshot(): Record<string, unknown> {
    return {};
  }
}

test("public plugin adapter forwards hardening events as public-safe payloads", () => {
  const slowTicks: Array<{ ts: string; roomId: string; durationMs: number; thresholdMs: number }> = [];
  const roomErrors: Array<{ context: string; error: { name: string; message: string } }> = [];
  const room = new AdapterRoom();

  const adapted = adaptPublicPlugin(
    {
      onSlowTick: (_room, event) => slowTicks.push(event),
      onRoomError: (_room, event) => roomErrors.push(event)
    },
    {
      disconnectPlayer: () => {},
      sendToPlayer: () => {}
    }
  );

  adapted.onSlowTick?.(room, {
    ts: "2026-03-01T00:00:00.000Z",
    roomId: room.id,
    durationMs: 12.5,
    thresholdMs: 10
  });
  adapted.onRoomError?.(room, "tick", new Error("boom"));
  adapted.onRoomError?.(room, "join", "bad join");

  assert.equal(slowTicks.length, 1);
  assert.deepEqual(slowTicks[0], {
    ts: "2026-03-01T00:00:00.000Z",
    roomId: "adapter-room",
    durationMs: 12.5,
    thresholdMs: 10
  });

  assert.equal(roomErrors.length, 2);
  assert.deepEqual(roomErrors[0], {
    context: "tick",
    error: {
      name: "Error",
      message: "boom"
    }
  });
  assert.deepEqual(roomErrors[1], {
    context: "join",
    error: {
      name: "Error",
      message: "bad join"
    }
  });
});
