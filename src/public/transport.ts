export interface TransportSession {
  id: string;
  isAuthenticated: boolean;
  playerId?: string;
  roomId?: string;
  protocolVersion?: number;
  lastPing: number;
}

export interface TransportEvents {
  onConnect: (session: TransportSession) => void;
  onPacket: (session: TransportSession, opcode: number, payload: Record<string, unknown>) => void;
  onDisconnect: (session: TransportSession) => void;
}

export interface Transport {
  setBindings?(
    config: Record<string, unknown>,
    events: TransportEvents,
    metricsProvider: () => Record<string, unknown>
  ): void;
  listen(): Promise<void>;
  close(): Promise<void>;
  send(sessionId: string, opcode: number, payload: Record<string, unknown>): void;
  disconnect(sessionId: string): void;
}
