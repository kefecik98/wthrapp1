// Fastify application builder — extracted so tests can construct the app
// without `listen()` or the cron-driven alert engine. `src/index.ts` calls
// `buildServer` for the real boot path; tests call it via `app.inject()`.

import Fastify, { FastifyInstance } from "fastify";
import { config } from "./config";
import authPlugin from "./plugins/auth";
import authRoutes from "./routes/auth";
import socialRoutes from "./routes/social";
import locationRoutes from "./routes/location";
import weatherRoutes from "./routes/weather";
import preferencesRoutes from "./routes/preferences";
import deviceRoutes from "./routes/device";
import webhookRoutes from "./routes/webhooks";
import devRoutes from "./routes/dev";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    // Quiet during tests; production boot turns the logger back on.
    logger: config.env !== "test",
    bodyLimit: 1_048_576,
    // Fastify's Ajv defaults to removeAdditional:true, which silently strips
    // unknown body fields. We want `additionalProperties:false` schemas to
    // *reject* unknown fields with a 400 instead (validate at the boundary).
    ajv: { customOptions: { removeAdditional: false } },
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(socialRoutes);
  await app.register(locationRoutes);
  await app.register(weatherRoutes);
  await app.register(preferencesRoutes);
  await app.register(deviceRoutes);
  await app.register(webhookRoutes);

  if (config.env !== "production") {
    await app.register(devRoutes);
  }

  return app;
}
