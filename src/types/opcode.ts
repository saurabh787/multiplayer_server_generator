export enum Opcode {
  AUTH = 1,
  AUTH_OK = 2,
  ERROR = 3,
  PING = 4,
  PONG = 5,

  MATCH_JOIN = 10,
  MATCH_FOUND = 11,
  MATCH_CANCEL = 12,

  ROOM_JOIN = 20,
  ROOM_JOINED = 21,
  ROOM_LEAVE = 22,
  ROOM_PLAYER_JOIN = 23,
  ROOM_PLAYER_LEAVE = 24,

  INPUT = 30,
  SNAPSHOT = 31,

  TURN_ACTION = 40,
  TURN_RESULT = 41
}

export const KNOWN_OPCODES: ReadonlySet<number> = new Set<number>(Object.values(Opcode).filter((value) => typeof value === "number") as number[]);
