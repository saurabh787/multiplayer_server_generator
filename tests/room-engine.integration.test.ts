import test from "node:test";
import assert from "node:assert/strict";
import { RealtimeEngine } from "../src/engine/realtime-engine";
import { createPlayer } from "../src/player/player";
import { PluginSystem } from "../src/plugins/plugin-system";
import { Opcode } from "../src/types/opcode";
import { RealtimeRoom } from "../src/room/realtime-room";

class MockRealtimeRoom extends RealtimeRoom {
  private positions = new Map<string, number>();

  public constructor(send: (sid: string, opcode: Opcode, payload: Record<string, unknown>) => void) {
    super("r1", "mock", 4, new PluginSystem(), { sendToSession: send });
  }

  public override onPlayerJoin(player: ReturnType<typeof createPlayer>): void {
    this.positions.set(player.id, 0);
  }

  public override onPlayerLeave(player: ReturnType<typeof createPlayer>): void {
    this.positions.delete(player.id);
  }

  public override onInput(player: ReturnType<typeof createPlayer>, input: Record<string, unknown>): void {
    super.onInput(player, input);
    const current = this.positions.get(player.id) ?? 0;
    const delta = typeof input.dx === "number" ? input.dx : 0;
    this.positions.set(player.id, current + delta);
  }

  public onTick(): void {}

  public getSnapshot(): Record<string, unknown> {
    return {
      players: [...this.positions.entries()].map(([id, x]) => ({ id, x }))
    };
  }
}

test("room + realtime engine emits snapshots and handles joins/leaves", async () => {
  const sent: Array<{ sid: string; opcode: Opcode; payload: Record<string, unknown> }> = [];
  const room = new MockRealtimeRoom((sid, opcode, payload) => sent.push({ sid, opcode, payload }));
  const engine = new RealtimeEngine(room, new PluginSystem(), { tickRate: 20, slowTickThresholdMs: 100 });
  room.attachEngine(engine);

  const p1 = createPlayer("p1", "s1");
  const p2 = createPlayer("p2", "s2");
  assert.equal(room.addPlayer(p1), true);
  assert.equal(room.addPlayer(p2), true);

  room.onInput(p1, { tick: 1, dx: 3 });
  room.start();
  await new Promise((r) => setTimeout(r, 130));
  room.stop();

  const snapshots = sent.filter((item) => item.opcode === Opcode.SNAPSHOT);
  assert.ok(snapshots.length >= 1);
  const latest = snapshots[snapshots.length - 1].payload as { s?: { players?: Array<{ id: string; x: number }> } };
  const players = latest.s?.players ?? [];
  assert.equal(players.some((item) => item.id === "p1" && item.x === 3), true);

  room.queueRemovePlayer("p2");
  room.processPendingRemovals();
  assert.equal(room.players.has("p2"), false);
  room.destroy();
  assert.equal(room.players.size, 0);
  assert.equal(room.pendingRemovals.size, 0);
});
