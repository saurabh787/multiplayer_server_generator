import { ErrorPayload } from "./error-codes";

export interface AuthPayload {
  token?: string;
  protocolVersion: number;
}

export interface AuthOkPayload {
  sessionId: string;
  playerId: string;
  reconnected?: boolean;
  roomId?: string;
}

export interface MatchJoinPayload {
  mode: "realtime" | "turn";
  roomType: string;
  requiredPlayers?: number;
  maxPlayers?: number;
}

export interface MatchFoundPayload {
  roomId: string;
  roomType: string;
  mode: "realtime" | "turn";
}

export interface RoomJoinPayload {
  roomId: string;
}

export interface RoomJoinedPayload {
  roomId: string;
  roomType: string;
  mode: "realtime" | "turn";
}

export interface RoomPlayerEventPayload {
  roomId: string;
  playerId: string;
}

export interface InputPayload {
  tick: number;
  input: Record<string, unknown>;
}

export interface SnapshotPayload {
  t: number;
  r: string;
  s: Record<string, unknown>;
}

export interface TurnActionPayload {
  action: number;
  data?: Record<string, unknown>;
}

export interface TurnResultPayload {
  playerId: string;
  action: number;
  state: Record<string, unknown>;
}

export type PacketPayload =
  | AuthPayload
  | AuthOkPayload
  | MatchJoinPayload
  | MatchFoundPayload
  | RoomJoinPayload
  | RoomJoinedPayload
  | RoomPlayerEventPayload
  | InputPayload
  | SnapshotPayload
  | TurnActionPayload
  | TurnResultPayload
  | ErrorPayload
  | Record<string, unknown>;
