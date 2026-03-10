import { PublicMessage } from "./types";

export interface PlayerContext {
  readonly id: string;
  readonly sessionId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  send(type: PublicMessage["type"], payload: PublicMessage["payload"]): void;
  disconnect(reason?: string): void;
}
