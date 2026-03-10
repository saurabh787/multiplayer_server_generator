import { performance } from "node:perf_hooks";
import { PluginSystem } from "../plugins/plugin-system";
import { RealtimeRoom } from "../room/realtime-room";
import { Engine } from "./engine";

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

export class RealtimeEngine implements Engine<RealtimeRoom> {
  private room?: RealtimeRoom;
  private readonly pluginSystem: PluginSystem;
  private readonly config: RealtimeEngineConfig;
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;
  private readonly fixedStepMs: number;

  public constructor(room: RealtimeRoom, pluginSystem: PluginSystem, config: RealtimeEngineConfig);
  public constructor(pluginSystem: PluginSystem, config: RealtimeEngineConfig);
  public constructor(
    roomOrPluginSystem: RealtimeRoom | PluginSystem,
    pluginSystemOrConfig: PluginSystem | RealtimeEngineConfig,
    config?: RealtimeEngineConfig
  ) {
    if (config) {
      this.room = roomOrPluginSystem as RealtimeRoom;
      this.pluginSystem = pluginSystemOrConfig as PluginSystem;
      this.config = config;
    } else {
      this.pluginSystem = roomOrPluginSystem as PluginSystem;
      this.config = pluginSystemOrConfig as RealtimeEngineConfig;
    }
    this.fixedStepMs = Math.floor(1000 / this.config.tickRate);
  }

  public attachRoom(room: RealtimeRoom): void {
    this.room = room;
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
    if (this.room && this.room.state !== "active") {
      this.stop();
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
    const room = this.room;
    if (!room) {
      return;
    }
    if (room.state !== "active") {
      this.stop();
      return;
    }
    const started = performance.now();
    try {
      room.tick(deltaMs);
      this.config.onSnapshotEmitted?.();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[realtime-engine:${room.id}]`, error);
      this.pluginSystem.onRoomError(room, "realtimeTick", error);
      room.destroy();
      this.stop();
      return;
    }

    const duration = performance.now() - started;
    this.config.onTickMeasured?.(duration);
    if (duration > this.config.slowTickThresholdMs) {
      const event = {
        ts: new Date().toISOString(),
        roomId: room.id,
        durationMs: Number(duration.toFixed(2)),
        thresholdMs: this.config.slowTickThresholdMs
      };
      this.config.onSlowTick?.(event);
      this.pluginSystem.onSlowTick(room, event);
      // eslint-disable-next-line no-console
      console.warn(`[realtime-engine:${room.id}] slow tick ${duration.toFixed(2)}ms`);
    }
  }
}
