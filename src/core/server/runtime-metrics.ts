export interface RuntimeMetricsSnapshot {
  activeConnections: number;
  totalConnectionsAccepted: number;
  activeAuthenticatedConnections: number;
  totalAuthSuccess: number;
  activeRooms: number;
  roomsCreated: number;
  roomsDestroyed: number;
  activeRoomPlayers: number;
  totalRoomJoins: number;
  totalRoomLeaves: number;
  inputsReceived: number;
  snapshotsSent: number;
}

export class RuntimeMetrics {
  private state: RuntimeMetricsSnapshot = {
    activeConnections: 0,
    totalConnectionsAccepted: 0,
    activeAuthenticatedConnections: 0,
    totalAuthSuccess: 0,
    activeRooms: 0,
    roomsCreated: 0,
    roomsDestroyed: 0,
    activeRoomPlayers: 0,
    totalRoomJoins: 0,
    totalRoomLeaves: 0,
    inputsReceived: 0,
    snapshotsSent: 0
  };

  public onConnect(): void {
    this.state.activeConnections += 1;
    this.state.totalConnectionsAccepted += 1;
  }

  public onDisconnect(wasAuthenticated: boolean): void {
    this.state.activeConnections = Math.max(0, this.state.activeConnections - 1);
    if (wasAuthenticated) {
      this.state.activeAuthenticatedConnections = Math.max(0, this.state.activeAuthenticatedConnections - 1);
    }
  }

  public onAuthSuccess(): void {
    this.state.activeAuthenticatedConnections += 1;
    this.state.totalAuthSuccess += 1;
  }

  public onRoomCreated(): void {
    this.state.roomsCreated += 1;
    this.state.activeRooms += 1;
  }

  public onRoomDestroyed(): void {
    this.state.roomsDestroyed += 1;
    this.state.activeRooms = Math.max(0, this.state.activeRooms - 1);
  }

  public onRoomJoin(): void {
    this.state.totalRoomJoins += 1;
    this.state.activeRoomPlayers += 1;
  }

  public onRoomLeave(): void {
    this.state.totalRoomLeaves += 1;
    this.state.activeRoomPlayers = Math.max(0, this.state.activeRoomPlayers - 1);
  }

  public onInput(): void {
    this.state.inputsReceived += 1;
  }

  public onSnapshot(): void {
    this.state.snapshotsSent += 1;
  }

  public snapshot(): RuntimeMetricsSnapshot {
    return { ...this.state };
  }
}
