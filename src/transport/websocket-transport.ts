import { randomUUID } from "node:crypto";
import { createServer, Server as HttpServer } from "node:http";
import { decodePacket, encodePacket, ProtocolError } from "../protocol/protocol";
import { Session, createSession } from "../player/session";
import { Opcode } from "../types/opcode";
import { ServerConfig } from "../types/config";
import { WebSocketServer } from "ws";

export interface TransportEvents {
  onConnect: (session: Session) => void;
  onPacket: (session: Session, opcode: number, payload: Record<string, unknown>) => void;
  onDisconnect: (session: Session) => void;
}

function toBuffer(data: Buffer | ArrayBuffer | Buffer[]): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.from(new Uint8Array(data));
}

export class WebSocketTransport {
  private readonly config: ServerConfig;
  private readonly events: TransportEvents;
  private readonly sessions = new Map<string, Session>();
  private wss?: WebSocketServer;
  private heartbeatTimer?: NodeJS.Timeout;
  private metricsServer?: HttpServer;
  private readonly metricsProvider: () => Record<string, unknown>;

  public constructor(config: ServerConfig, events: TransportEvents, metricsProvider: () => Record<string, unknown>) {
    this.config = config;
    this.events = events;
    this.metricsProvider = metricsProvider;
  }

  public listen(): Promise<void> {
    this.wss = new WebSocketServer({
      port: this.config.port,
      maxPayload: this.config.maxPacketSizeBytes
    });
    this.wss.on("connection", (socket) => {
      const session = createSession(randomUUID(), socket);
      this.sessions.set(session.id, session);
      this.events.onConnect(session);

      socket.on("message", (data, isBinary) => {
        if (!isBinary || typeof data === "string") {
          socket.close();
          return;
        }

        const buffer = toBuffer(data);
        if (buffer.byteLength > this.config.maxPacketSizeBytes) {
          socket.close();
          return;
        }

        try {
          const decoded = decodePacket(buffer, this.config.maxPacketSizeBytes);
          this.events.onPacket(session, decoded.opcode, decoded.payload);
        } catch (error) {
          if (error instanceof ProtocolError && error.fatal) {
            socket.close();
            return;
          }
          socket.close();
        }
      });

      socket.on("close", () => {
        this.sessions.delete(session.id);
        this.events.onDisconnect(session);
      });
    });

    this.metricsServer = createServer((req, res) => {
      if (req.url !== "/metrics") {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(this.metricsProvider()));
    });

    this.heartbeatTimer = setInterval(() => {
      for (const session of this.sessions.values()) {
        if (Date.now() - session.lastPing > this.config.sessionTimeoutMs) {
          session.socket.close();
          continue;
        }
        this.send(session.id, Opcode.PING, { ts: Date.now() });
      }
    }, this.config.pingIntervalMs);

    return new Promise((resolve, reject) => {
      this.metricsServer?.listen(this.config.metricsPort);
      this.wss?.on("listening", () => resolve());
      this.wss?.on("error", reject);
    });
  }

  public getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  public getAllSessions(): Session[] {
    return [...this.sessions.values()];
  }

  public send(sessionId: string, opcode: Opcode, payload: Record<string, unknown>): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.socket.readyState !== session.socket.OPEN) {
      return;
    }
    const packet = encodePacket(opcode, payload);
    session.socket.send(packet);
  }

  public async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    const closeWss = new Promise<void>((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      for (const session of this.sessions.values()) {
        session.socket.close();
      }
      this.wss.close(() => resolve());
    });

    const closeMetrics = new Promise<void>((resolve) => {
      if (!this.metricsServer) {
        resolve();
        return;
      }
      this.metricsServer.close(() => resolve());
    });

    await Promise.all([closeWss, closeMetrics]);
  }
}
