import test from "node:test";
import assert from "node:assert/strict";
import { createPlayer } from "../src/player/player";
import { PluginSystem } from "../src/plugins/plugin-system";
import { Opcode } from "../src/types/opcode";
import { RealtimeRoom } from "../src/room/realtime-room";

class TestRoom extends RealtimeRoom {
  public destroyed = false;

  public constructor() {
    super("room-1", "test", 2, new PluginSystem(), {
      sendToSession: () => {}
    });
  }

  public onTick(): void {}
  public getSnapshot(): Record<string, unknown> {
    return {};
  }
  public override onDestroy(): void {
    this.destroyed = true;
    super.onDestroy();
  }
}

test("room state transitions and player lifecycle", () => {
  const room = new TestRoom();
  const p1 = createPlayer("p1", "s1");
  const p2 = createPlayer("p2", "s2");
  assert.equal(room.state, "active");
  assert.equal(room.addPlayer(p1), true);
  assert.equal(room.addPlayer(p2), true);
  assert.equal(room.players.size, 2);

  room.queueRemovePlayer("p1");
  room.processPendingRemovals();
  assert.equal(room.players.size, 1);
  assert.equal(room.pendingRemovals.size, 0);
  assert.equal(p1.roomId, undefined);
  assert.equal(p1.active, false);

  room.destroy();
  assert.equal(room.state, "destroyed");
  assert.equal(room.destroyed, true);
  assert.equal(p2.roomId, undefined);
  assert.equal(p2.active, false);
  assert.equal(room.addPlayer(createPlayer("p3", "s3")), false);
});

test("room broadcasts join/leave events via context", () => {
  const out: Array<{ sid: string; opcode: Opcode }> = [];
  class EmittingRoom extends RealtimeRoom {
    public constructor() {
      super("room-2", "test", 2, new PluginSystem(), {
        sendToSession: (sid, opcode) => out.push({ sid, opcode })
      });
    }
    public onTick(): void {}
    public getSnapshot(): Record<string, unknown> {
      return {};
    }
  }
  const room = new EmittingRoom();
  const p1 = createPlayer("p1", "s1");
  const p2 = createPlayer("p2", "s2");
  room.addPlayer(p1);
  room.addPlayer(p2);
  room.queueRemovePlayer("p1");
  room.processPendingRemovals();
  assert.equal(out.some((item) => item.opcode === Opcode.ROOM_PLAYER_JOIN), true);
  assert.equal(out.some((item) => item.opcode === Opcode.ROOM_PLAYER_LEAVE), true);
});
