import test from "node:test";
import assert from "node:assert/strict";
import { Telemetry } from "../src/infra/telemetry";

test("telemetry start/stop idempotence and snapshot shape", () => {
  const telemetry = new Telemetry({
    intervalMs: 50,
    enableFileLogging: false
  });

  telemetry.start();
  telemetry.start();
  telemetry.recordTick(1.2);
  const snap = telemetry.snapshot();
  assert.equal(typeof snap.cpuPercent, "number");
  assert.equal(typeof snap.memoryMb.heapUsed, "number");
  assert.equal(typeof snap.eventLoopLagMs.mean, "number");
  assert.equal(typeof snap.tickMs.avg, "number");
  telemetry.stop();
  telemetry.stop();
});
