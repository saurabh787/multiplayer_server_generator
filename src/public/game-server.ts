import {
  GameServer as InternalGameServer,
  GameServerOptions as InternalGameServerOptions
} from "../core/server/internal-server";
import { adaptPublicPlugin } from "../core/plugins/public-plugin-adapter";
import { Plugin } from "./plugin";
import { PublicServerConfig, RoomConstructor, RoomOptions } from "./types";

export interface GameServerOptions {
  config?: PublicServerConfig;
  onRealtimeTickMeasured?: InternalGameServerOptions["onRealtimeTickMeasured"];
  onSlowTick?: InternalGameServerOptions["onSlowTick"];
}

export class GameServer {
  private readonly internal: InternalGameServer;

  public constructor(options: GameServerOptions = {}) {
    const publicConfig = options.config ?? {};
    const internalConfig: InternalGameServerOptions["config"] = {};
    if (publicConfig.port !== undefined) {
      internalConfig.port = publicConfig.port;
    }
    if (publicConfig.metricsPort !== undefined) {
      internalConfig.metricsPort = publicConfig.metricsPort;
    }
    if (publicConfig.maxPacketSizeBytes !== undefined) {
      internalConfig.maxPacketSizeBytes = publicConfig.maxPacketSizeBytes;
    }
    if (publicConfig.protocolVersion !== undefined) {
      internalConfig.protocolVersion = publicConfig.protocolVersion;
    }
    if (publicConfig.tickRate !== undefined) {
      internalConfig.realtimeTickRate = publicConfig.tickRate;
    }
    if (publicConfig.pingIntervalMs !== undefined) {
      internalConfig.pingIntervalMs = publicConfig.pingIntervalMs;
    }
    if (publicConfig.sessionTimeoutMs !== undefined) {
      internalConfig.sessionTimeoutMs = publicConfig.sessionTimeoutMs;
    }
    if (publicConfig.maxInputsPerSecond !== undefined) {
      internalConfig.maxInputsPerSecond = publicConfig.maxInputsPerSecond;
    }
    if (publicConfig.maxInputBufferPerPlayer !== undefined) {
      internalConfig.maxInputBufferPerPlayer = publicConfig.maxInputBufferPerPlayer;
    }
    if (publicConfig.maxBufferedAmountBytes !== undefined) {
      internalConfig.maxBufferedAmountBytes = publicConfig.maxBufferedAmountBytes;
    }
    if (publicConfig.slowTickThresholdMs !== undefined) {
      internalConfig.slowTickThresholdMs = publicConfig.slowTickThresholdMs;
    }
    if (publicConfig.reconnectGraceMs !== undefined) {
      internalConfig.reconnectGraceMs = publicConfig.reconnectGraceMs;
    }
    this.internal = new InternalGameServer({
      config: internalConfig,
      transport: publicConfig.transport as InternalGameServerOptions["transport"],
      onRealtimeTickMeasured: options.onRealtimeTickMeasured,
      onSlowTick: options.onSlowTick
    });
  }

  public start(): Promise<void> {
    return this.internal.listen();
  }

  public stop(): Promise<void> {
    return this.internal.shutdown();
  }

  public listen(): Promise<void> {
    return this.start();
  }

  public shutdown(): Promise<void> {
    return this.stop();
  }

  public use(plugin: Plugin): void {
    this.internal.use(
      adaptPublicPlugin(plugin, {
        disconnectPlayer: (playerId, reason) => this.internal.disconnectPlayer(playerId, reason),
        sendToPlayer: (playerId, type, payload) => this.internal.sendPlayerMessage(playerId, type, payload)
      })
    );
  }

  public defineRoom<TState>(
    name: string,
    roomClass: RoomConstructor<TState>,
    options?: RoomOptions
  ): void {
    this.internal.registerRoom(name, roomClass, options);
  }

  public metrics(): Record<string, unknown> {
    return this.internal.metrics();
  }
}
