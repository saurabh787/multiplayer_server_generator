import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
import { createWriteStream, WriteStream } from "node:fs";
import path from "node:path";

export interface TelemetrySnapshot {
  ts: string;
  cpuPercent: number;
  memoryMb: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  eventLoopLagMs: {
    mean: number;
    max: number;
  };
  gc: {
    count: number;
    totalDurationMs: number;
    heapDropEvents: number;
  };
  tickMs: {
    avg: number;
    max: number;
    count: number;
  };
}

export interface TelemetryOptions {
  intervalMs?: number;
  enableFileLogging?: boolean;
  logFilePath?: string;
}

export class Telemetry {
  private readonly intervalMs: number;
  private readonly enableFileLogging: boolean;
  private readonly logFilePath: string;
  private readonly loop = monitorEventLoopDelay({ resolution: 20 });
  private readonly gcObserver: PerformanceObserver;
  private timer?: NodeJS.Timeout;
  private logStream?: WriteStream;
  private streamErrorLogged = false;
  private lastCpu = process.cpuUsage();
  private lastTime = process.hrtime.bigint();
  private lastHeapUsed = process.memoryUsage().heapUsed;
  private tickCount = 0;
  private totalTickTime = 0;
  private maxTickTime = 0;
  private gcCount = 0;
  private gcDurationMs = 0;
  private gcHeapDropEvents = 0;

  public constructor(options: number | TelemetryOptions = 5_000) {
    if (typeof options === "number") {
      this.intervalMs = options;
      this.enableFileLogging = true;
      this.logFilePath = path.join(process.cwd(), "telemetry.log");
    } else {
      this.intervalMs = options.intervalMs ?? 5_000;
      this.enableFileLogging = options.enableFileLogging ?? true;
      this.logFilePath = options.logFilePath ?? path.join(process.cwd(), "telemetry.log");
    }
    this.gcObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType !== "gc") {
          continue;
        }
        this.gcCount += 1;
        this.gcDurationMs += entry.duration;
      }
    });
  }

  public start(): void {
    if (this.timer) {
      return;
    }
    if (this.enableFileLogging && !this.logStream) {
      this.logStream = createWriteStream(this.logFilePath, { flags: "a" });
      this.logStream.on("error", (error) => {
        if (this.streamErrorLogged) {
          return;
        }
        this.streamErrorLogged = true;
        // eslint-disable-next-line no-console
        console.error(`[telemetry] log stream error: ${(error as Error).message}`);
      });
    }
    this.loop.enable();
    this.gcObserver.observe({ entryTypes: ["gc"] });
    this.timer = setInterval(() => this.report(), this.intervalMs);
  }

  public stop(): void {
    if (!this.timer) {
      if (this.logStream) {
        this.logStream.end();
        this.logStream = undefined;
      }
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
    this.loop.disable();
    this.gcObserver.disconnect();
    if (this.logStream) {
      this.logStream.end();
      this.logStream = undefined;
    }
  }

  public recordTick(durationMs: number): void {
    this.tickCount += 1;
    this.totalTickTime += durationMs;
    if (durationMs > this.maxTickTime) {
      this.maxTickTime = durationMs;
    }
  }

  public snapshot(): TelemetrySnapshot {
    const now = process.hrtime.bigint();
    const elapsedNs = Number(now - this.lastTime);
    const elapsedMs = elapsedNs / 1e6;
    const cpuNow = process.cpuUsage();
    const userDiff = cpuNow.user - this.lastCpu.user;
    const sysDiff = cpuNow.system - this.lastCpu.system;
    const totalCpuMicros = userDiff + sysDiff;
    const cpuPercent = elapsedMs > 0 ? ((totalCpuMicros / 1000) / elapsedMs) * 100 : 0;
    const mem = process.memoryUsage();

    if (mem.heapUsed < this.lastHeapUsed) {
      this.gcHeapDropEvents += 1;
    }

    const avgTick = this.tickCount > 0 ? this.totalTickTime / this.tickCount : 0;
    const out: TelemetrySnapshot = {
      ts: new Date().toISOString(),
      cpuPercent: Number(cpuPercent.toFixed(2)),
      memoryMb: {
        rss: Number((mem.rss / 1024 / 1024).toFixed(2)),
        heapUsed: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
        heapTotal: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
        external: Number((mem.external / 1024 / 1024).toFixed(2))
      },
      eventLoopLagMs: {
        mean: Number((this.loop.mean / 1e6).toFixed(2)),
        max: Number((this.loop.max / 1e6).toFixed(2))
      },
      gc: {
        count: this.gcCount,
        totalDurationMs: Number(this.gcDurationMs.toFixed(2)),
        heapDropEvents: this.gcHeapDropEvents
      },
      tickMs: {
        avg: Number(avgTick.toFixed(2)),
        max: Number(this.maxTickTime.toFixed(2)),
        count: this.tickCount
      }
    };

    this.loop.reset();
    this.lastCpu = cpuNow;
    this.lastTime = now;
    this.lastHeapUsed = mem.heapUsed;
    this.tickCount = 0;
    this.totalTickTime = 0;
    this.maxTickTime = 0;
    this.gcCount = 0;
    this.gcDurationMs = 0;

    return out;
  }

  private report(): void {
    const data = JSON.stringify({ type: "telemetry", ...this.snapshot() });
    // eslint-disable-next-line no-console
    console.log(data);
    if (this.logStream && !this.streamErrorLogged) {
      this.logStream.write(`${data}\n`);
    }
  }
}
