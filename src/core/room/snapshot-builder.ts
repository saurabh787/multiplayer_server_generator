export interface SnapshotEnvelope {
  [key: string]: unknown;
  t: number;
  r: string;
  s: Record<string, unknown>;
}

export function buildSnapshot(tick: number, roomId: string, state: Record<string, unknown>): SnapshotEnvelope {
  return { t: tick, r: roomId, s: state };
}

export class TickIntegrityGuard {
  private lastTick = 0;

  public assertIncreasing(currentTick: number): void {
    if (currentTick <= this.lastTick) {
      throw new Error(`Tick regression detected: current=${currentTick}, last=${this.lastTick}`);
    }
    this.lastTick = currentTick;
  }
}
