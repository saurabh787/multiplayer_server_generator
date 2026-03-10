import { ServerConfig } from "../../types/config";
import { Session } from "../player/session";

export interface TransportEvents {
  onConnect: (session: Session) => void;
  onPacket: (session: Session, opcode: number, payload: Record<string, unknown>) => void;
  onDisconnect: (session: Session) => void;
}

export interface RuntimeTransport {
  setBindings?(
    config: ServerConfig,
    events: TransportEvents,
    metricsProvider: () => Record<string, unknown>
  ): void;
  listen(): Promise<void>;
  close(): Promise<void>;
  send(sessionId: string, opcode: number, payload: Record<string, unknown>): void;
  disconnect(sessionId: string): void;
}
