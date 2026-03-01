import { GameServer } from "../src/server/game-server";

export async function withOptionalEmbeddedServer(
  port: number,
  metricsPort: number
): Promise<{ url: string; stop: () => Promise<void> }> {
  if (process.env.USE_EMBEDDED_SERVER !== "1") {
    return {
      url: process.env.URL ?? "ws://localhost:3000",
      stop: async () => {}
    };
  }

  const server = new GameServer({
    config: {
      port,
      metricsPort
    }
  });
  await server.listen();
  return {
    url: `ws://localhost:${port}`,
    stop: async () => {
      await server.shutdown();
    }
  };
}
