import { decode as msgpackDecode, encode as msgpackEncode } from "@msgpack/msgpack";
import { KNOWN_OPCODES } from "../types/opcode";

export interface DecodedPacket {
  opcode: number;
  payload: Record<string, unknown>;
}

export class ProtocolError extends Error {
  public readonly fatal: boolean;

  public constructor(message: string, fatal = true) {
    super(message);
    this.name = "ProtocolError";
    this.fatal = fatal;
  }
}

export function encodePacket(opcode: number, payload: Record<string, unknown>): Buffer {
  if (!KNOWN_OPCODES.has(opcode)) {
    throw new ProtocolError(`Unknown opcode ${opcode}`);
  }

  const encodedPayload = Buffer.from(msgpackEncode(payload));
  return Buffer.concat([Buffer.from([opcode]), encodedPayload]);
}

export function decodePacket(buffer: Buffer, maxPacketSizeBytes: number): DecodedPacket {
  if (buffer.byteLength === 0) {
    throw new ProtocolError("Empty packet");
  }
  if (buffer.byteLength > maxPacketSizeBytes) {
    throw new ProtocolError("Packet exceeds max size");
  }

  const opcode = buffer.readUInt8(0);
  if (!KNOWN_OPCODES.has(opcode)) {
    throw new ProtocolError(`Unknown opcode ${opcode}`);
  }

  const payloadBuffer = buffer.subarray(1);
  try {
    const decoded = payloadBuffer.byteLength === 0 ? {} : msgpackDecode(payloadBuffer);
    if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new ProtocolError("Payload must be an object");
    }
    return { opcode, payload: decoded as Record<string, unknown> };
  } catch (error) {
    if (error instanceof ProtocolError) {
      throw error;
    }
    throw new ProtocolError(`Decode failed: ${(error as Error).message}`);
  }
}
