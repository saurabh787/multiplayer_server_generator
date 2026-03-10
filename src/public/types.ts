import type { Transport } from "./transport";
import type { Room } from "./room";

export interface ServerConfig {
  port?: number;
  metricsPort?: number;
  maxPacketSizeBytes?: number;
  protocolVersion?: number;
  tickRate?: number;
  pingIntervalMs?: number;
  sessionTimeoutMs?: number;
  maxInputsPerSecond?: number;
  maxInputBufferPerPlayer?: number;
  maxBufferedAmountBytes?: number;
  slowTickThresholdMs?: number;
  reconnectGraceMs?: number;
  transport?: Transport;
}

export type PublicServerConfig = ServerConfig;

export interface RoomOptions {
  maxClients?: number;
  tickRate?: number;
  autoDispose?: boolean;
  engine?: "realtime" | "turn";
}

export type RoomConstructor<TState = Record<string, unknown>> = new () => Room<TState>;

export interface PublicMessage {
  type: string;
  payload: unknown;
}

export interface PublicSlowTickEvent {
  ts: string;
  roomId: string;
  durationMs: number;
  thresholdMs: number;
}

export interface PublicRoomErrorEvent {
  context: string;
  error: {
    name: string;
    message: string;
  };
}
