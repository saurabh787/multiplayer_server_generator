import { Telemetry } from "./infra/telemetry";
import { GameServer } from "./server/game-server";

async function main(): Promise<void> {
  const telemetry = new Telemetry(5_000);
  telemetry.start();

  const server = new GameServer({
    onRealtimeTickMeasured: (durationMs) => telemetry.recordTick(durationMs)
  });
  await server.listen();
  // eslint-disable-next-line no-console
  console.log("Multiplayer server listening on ws://localhost:3000 (metrics http://localhost:3001/metrics)");

  const shutdown = async (): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log("Graceful shutdown...");
    telemetry.stop();
    await server.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main();
