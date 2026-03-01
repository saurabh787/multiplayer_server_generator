import test from "node:test";
import assert from "node:assert/strict";
import { decodePacket, encodePacket, ProtocolError } from "../src/protocol/protocol";
import { Opcode } from "../src/types/opcode";

test("protocol encode/decode symmetry", () => {
  const encoded = encodePacket(Opcode.AUTH, { protocolVersion: 1, token: "abc" });
  const decoded = decodePacket(encoded, 8192);
  assert.equal(decoded.opcode, Opcode.AUTH);
  assert.equal(decoded.payload.protocolVersion, 1);
  assert.equal(decoded.payload.token, "abc");
});

test("protocol rejects unknown opcode", () => {
  const invalid = Buffer.from([255, 1, 2, 3]);
  assert.throws(() => decodePacket(invalid, 8192), ProtocolError);
});

test("protocol rejects oversized payload", () => {
  const big = Buffer.alloc(9000, 1);
  assert.throws(() => decodePacket(big, 8192), ProtocolError);
});

test("protocol rejects malformed payload", () => {
  const malformed = Buffer.from([Opcode.AUTH, 0xc1]); // never-used msgpack marker
  assert.throws(() => decodePacket(malformed, 8192), ProtocolError);
});
