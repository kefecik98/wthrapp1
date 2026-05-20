// Server entry point.
// Boots Fastify (via buildServer), starts the alert engine, and wires up
// graceful shutdown. The app builder itself lives in `./app.ts` so tests
// can construct the same app without `listen()` or the cron.

import { config } from "./config";
import { disconnectDb } from "./db";
import { buildServer } from "./app";
import { startAlertEngine, stopAlertEngine } from "./engine/alertEngine";

async function main() {
  const app = await buildServer();

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  startAlertEngine();

  // Graceful shutdown: stop the cron, close HTTP, disconnect Prisma.
  const shutdown = async (signal: string) => {
    app.log.info(`received ${signal}, shutting down`);
    stopAlertEngine();
    await app.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
