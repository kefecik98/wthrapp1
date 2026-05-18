// Server entry point.
// Boots Fastify, registers the auth plugin + routes, starts the alert
// engine, and wires up graceful shutdown.

import Fastify from "fastify";
import { config } from "./config";
import { disconnectDb } from "./db";
import authPlugin from "./plugins/auth";
import authRoutes from "./routes/auth";
import locationRoutes from "./routes/location";
import weatherRoutes from "./routes/weather";
import preferencesRoutes from "./routes/preferences";
import deviceRoutes from "./routes/device";
import webhookRoutes from "./routes/webhooks";
import devRoutes from "./routes/dev";
import { startAlertEngine, stopAlertEngine } from "./engine/alertEngine";

async function buildServer() {
  const app = Fastify({
    logger: true,
    // RevenueCat needs the raw body available; Fastify's default JSON
    // parser is fine here since we verify via a shared secret header.
    bodyLimit: 1_048_576,
  });

  // Liveness probe.
  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(locationRoutes);
  await app.register(weatherRoutes);
  await app.register(preferencesRoutes);
  await app.register(deviceRoutes);
  await app.register(webhookRoutes);

  // Dev-only helper routes — never registered in production.
  if (config.env !== "production") {
    await app.register(devRoutes);
  }

  return app;
}

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
