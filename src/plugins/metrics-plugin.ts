import { Plugin } from "./types";

export interface MetricsSnapshot {
  totalConnections: number;
  authenticatedConnections: number;
  roomsCreated: number;
  roomsDestroyed: number;
  inputsReceived: number;
  snapshotsSent: number;
}

export class MetricsPlugin implements Plugin {
  public readonly name = "metrics";
  private readonly state: MetricsSnapshot = {
    totalConnections: 0,
    authenticatedConnections: 0,
    roomsCreated: 0,
    roomsDestroyed: 0,
    inputsReceived: 0,
    snapshotsSent: 0
  };

  public onConnect(): void {
    this.state.totalConnections += 1;
  }

  public onAuth(): void {
    this.state.authenticatedConnections += 1;
  }

  public onRoomCreate(): void {
    this.state.roomsCreated += 1;
  }

  public onRoomDestroy(): void {
    this.state.roomsDestroyed += 1;
  }

  public onInput(): void {
    this.state.inputsReceived += 1;
  }

  public afterSnapshot(): void {
    this.state.snapshotsSent += 1;
  }

  public snapshot(): MetricsSnapshot {
    return { ...this.state };
  }
}
