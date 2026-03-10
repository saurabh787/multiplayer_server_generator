import test from "node:test";
import assert from "node:assert/strict";
import { KNOWN_OPCODES, Opcode } from "../src/types/opcode";
import { encodePacket, ProtocolError } from "../src/protocol/protocol";

test("opcode registry includes all expected public opcodes", () => {
  const expected = [
    Opcode.AUTH,
    Opcode.AUTH_OK,
    Opcode.ERROR,
    Opcode.PING,
    Opcode.PONG,
    Opcode.MATCH_JOIN,
    Opcode.MATCH_FOUND,
    Opcode.MATCH_CANCEL,
    Opcode.ROOM_JOIN,
    Opcode.ROOM_JOINED,
    Opcode.ROOM_LEAVE,
    Opcode.ROOM_PLAYER_JOIN,
    Opcode.ROOM_PLAYER_LEAVE,
    Opcode.ROOM_MESSAGE,
    Opcode.INPUT,
    Opcode.SNAPSHOT,
    Opcode.TURN_ACTION,
    Opcode.TURN_RESULT
  ];

  for (const opcode of expected) {
    assert.equal(KNOWN_OPCODES.has(opcode), true);
  }
});

test("opcode validation rejects unknown values at encode time", () => {
  assert.throws(() => encodePacket(255, { invalid: true }), ProtocolError);
});
