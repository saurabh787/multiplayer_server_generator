import { performance } from "node:perf_hooks";
import { PluginSystem } from "../plugins/plugin-system";
import { Opcode } from "../types/opcode";
import { RealtimeRoom } from "../room/realtime-room";
import { buildSnapshot } from "../room/snapshot-builder";

export interface SlowTickEvent {
  ts: string;
  roomId: string;
  durationMs: number;
  thresholdMs: number;
}

export interface RealtimeEngineConfig {
  tickRate: number;
  slowTickThresholdMs: number;
  onTickMeasured?: (durationMs: number) => void;
  onSnapshotEmitted?: () => void;
  onSlowTick?: (event: SlowTickEvent) => void;
}

export class RealtimeEngine {
  private readonly room: RealtimeRoom;
  private readonly pluginSystem: PluginSystem;
  private readonly config: RealtimeEngineConfig;
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;
  private readonly fixedStepMs: number;
  private tickCount = 0;

  public constructor(room: RealtimeRoom, pluginSystem: PluginSystem, config: RealtimeEngineConfig) {
    this.room = room;
    this.pluginSystem = pluginSystem;
    this.config = config;
    this.fixedStepMs = Math.floor(1000 / config.tickRate);
  }

  public start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTime = Date.now();
    this.loop();
  }

  public stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private loop(): void {
    if (!this.running) {
      return;
    }
    const now = Date.now();
    const elapsed = now - this.lastTime;
    this.lastTime = now;
    this.accumulator += elapsed;

    let catches = 0;
    while (this.accumulator >= this.fixedStepMs && catches < 5) {
      this.step(this.fixedStepMs);
      this.accumulator -= this.fixedStepMs;
      catches += 1;
    }

    this.timer = setTimeout(() => this.loop(), this.fixedStepMs);
  }

  private step(deltaMs: number): void {
    const started = performance.now();
    try {
      this.room.onTick(deltaMs);
      this.pluginSystem.beforeSnapshot(this.room);
      const snapshot = this.room.getSnapshot();
      this.tickCount += 1;
      this.room.broadcast(Opcode.SNAPSHOT, buildSnapshot(this.tickCount, this.room.id, snapshot));
      this.config.onSnapshotEmitted?.();
      this.pluginSystem.afterSnapshot(this.room, snapshot);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[realtime-engine:${this.room.id}]`, error);
      this.room.destroy();
      this.stop();
      return;
    } finally {
      for (const player of this.room.players.values()) {
        player.inputBuffer = [];
      }
      this.room.processPendingRemovals();
    }

    const duration = performance.now() - started;
    this.config.onTickMeasured?.(duration);
    if (duration > this.config.slowTickThresholdMs) {
      this.config.onSlowTick?.({
        ts: new Date().toISOString(),
        roomId: this.room.id,
        durationMs: Number(duration.toFixed(2)),
        thresholdMs: this.config.slowTickThresholdMs
      });
      // eslint-disable-next-line no-console
      console.warn(`[realtime-engine:${this.room.id}] slow tick ${duration.toFixed(2)}ms`);
    }
  }
}
