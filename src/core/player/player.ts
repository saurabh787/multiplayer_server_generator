export interface InputWindow {
  windowStartMs: number;
  count: number;
}

export interface Player {
  id: string;
  sessionId: string;
  roomId?: string;
  metadata: Record<string, unknown>;
  inputBuffer: Array<Record<string, unknown>>;
  inputCountWindow: InputWindow;
  connectedAt: number;
  active: boolean;
}

export function createPlayer(playerId: string, sessionId: string): Player {
  const now = Date.now();
  return {
    id: playerId,
    sessionId,
    roomId: undefined,
    metadata: {},
    inputBuffer: [],
    inputCountWindow: {
      windowStartMs: now,
      count: 0
    },
    connectedAt: now,
    active: true
  };
}
