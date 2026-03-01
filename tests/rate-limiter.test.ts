import test from "node:test";
import assert from "node:assert/strict";
import { allowWithinRate, RateWindow } from "../src/server/rate-limiter";

test("rate limiter allows up to limit and then blocks", () => {
  const win: RateWindow = { windowStartMs: 1_000, count: 0 };
  assert.equal(allowWithinRate(win, 1_100, 2), true);
  assert.equal(allowWithinRate(win, 1_200, 2), true);
  assert.equal(allowWithinRate(win, 1_300, 2), false);
});

test("rate limiter resets on next window", () => {
  const win: RateWindow = { windowStartMs: 1_000, count: 2 };
  assert.equal(allowWithinRate(win, 2_100, 2), true);
  assert.equal(win.count, 1);
});
