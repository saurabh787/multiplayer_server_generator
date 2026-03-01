export interface RateWindow {
  windowStartMs: number;
  count: number;
}

export function allowWithinRate(
  window: RateWindow,
  nowMs: number,
  limit: number,
  periodMs = 1_000
): boolean {
  if (nowMs - window.windowStartMs >= periodMs) {
    window.windowStartMs = nowMs;
    window.count = 0;
  }
  if (window.count >= limit) {
    return false;
  }
  window.count += 1;
  return true;
}
