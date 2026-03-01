export enum ErrorCode {
  INVALID_PACKET = 1001,
  UNKNOWN_OPCODE = 1002,
  NOT_AUTHENTICATED = 1003,
  ROOM_NOT_FOUND = 1004,
  ROOM_FULL = 1005,
  INVALID_TURN = 1006
}

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}
