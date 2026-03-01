import { WebSocket } from "ws";

export interface Session {
  id: string;
  socket: WebSocket;
  isAuthenticated: boolean;
  playerId?: string;
  roomId?: string;
  protocolVersion?: number;
  lastPing: number;
  connectedAt: number;
}

export function createSession(id: string, socket: WebSocket): Session {
  const now = Date.now();
  return {
    id,
    socket,
    isAuthenticated: false,
    lastPing: now,
    connectedAt: now
  };
}
