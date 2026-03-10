import test from "node:test";
import assert from "node:assert/strict";
import { shouldDisconnectForBackpressure } from "../src/core/transport/backpressure";

test("backpressure disconnect triggers only above threshold", () => {
  assert.equal(shouldDisconnectForBackpressure(10, 9), true);
  assert.equal(shouldDisconnectForBackpressure(10, 10), false);
  assert.equal(shouldDisconnectForBackpressure(0, 10), false);
});

test("backpressure helper ignores invalid threshold values", () => {
  assert.equal(shouldDisconnectForBackpressure(10, -1), false);
  assert.equal(shouldDisconnectForBackpressure(10, Number.NaN), false);
});
