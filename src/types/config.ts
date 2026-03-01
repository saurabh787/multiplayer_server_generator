export interface ServerConfig {
  port: number;
  metricsPort: number;
  maxPacketSizeBytes: number;
  protocolVersion: number;
  realtimeTickRate: number;
  pingIntervalMs: number;
  sessionTimeoutMs: number;
  maxInputsPerSecond: number;
  maxInputBufferPerPlayer: number;
  slowTickThresholdMs: number;
  reconnectGraceMs: number;
}

export const DEFAULT_CONFIG: ServerConfig = {
  port: 3000,
  metricsPort: 3001,
  maxPacketSizeBytes: 8 * 1024,
  protocolVersion: 1,
  realtimeTickRate: 20,
  pingIntervalMs: 5_000,
  sessionTimeoutMs: 15_000,
  maxInputsPerSecond: 60,
  maxInputBufferPerPlayer: 200,
  slowTickThresholdMs: 10,
  reconnectGraceMs: 10_000
};
