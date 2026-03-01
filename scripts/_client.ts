import WebSocket from "ws";
import { decodePacket, encodePacket } from "../src/protocol/protocol";
import { Opcode } from "../src/types/opcode";

function toBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.from(new Uint8Array(data));
}

export class LoadClient {
  private readonly ws: WebSocket;
  private readonly queue: Array<{ opcode: number; payload: Record<string, unknown> }> = [];
  private closed = false;

  public constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (data, isBinary) => {
      if (!isBinary || typeof data === "string") {
        return;
      }
      const packet = decodePacket(toBuffer(data), 8 * 1024);
      if (packet.opcode === Opcode.PING) {
        this.send(Opcode.PONG, { ts: Date.now() });
        return;
      }
      this.queue.push(packet);
    });
    this.ws.on("close", () => {
      this.closed = true;
    });
  }

  public async waitOpen(timeoutMs = 4000): Promise<void> {
    if (this.ws.readyState === this.ws.OPEN) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("open timeout")), timeoutMs);
      this.ws.once("open", () => {
        clearTimeout(t);
        resolve();
      });
      this.ws.once("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }

  public send(opcode: Opcode, payload: Record<string, unknown>): void {
    this.ws.send(encodePacket(opcode, payload));
  }

  public async waitFor(opcode: Opcode, timeoutMs = 4000): Promise<Record<string, unknown>> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const item = this.queue.find((v) => v.opcode === opcode);
      if (item) {
        this.queue.splice(this.queue.indexOf(item), 1);
        return item.payload;
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`Timed out waiting for opcode ${opcode}`);
  }

  public getQueue(): Array<{ opcode: number; payload: Record<string, unknown> }> {
    return this.queue;
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public close(): void {
    this.ws.close();
  }
}
