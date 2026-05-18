// Preferences routes: read and update the user's alert configuration.

import { FastifyInstance } from "fastify";
import { prisma } from "../db";

interface PreferencesBody {
  alertLeadMin?: number;
  alertRain?: boolean;
  alertSnow?: boolean;
  alertHail?: boolean;
  alertThunder?: boolean;
  alertWind?: boolean;
  minRainIntensity?: "light" | "moderate" | "heavy";
  notificationsOn?: boolean;
}

export default async function preferencesRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/preferences",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const prefs = await prisma.userPreferences.findUnique({
        where: { userId: request.userId },
      });
      if (!prefs) {
        return reply.code(404).send({ error: "Preferences not found" });
      }
      return reply.send(prefs);
    },
  );

  app.put<{ Body: PreferencesBody }>(
    "/preferences",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            alertLeadMin: { type: "integer", minimum: 1, maximum: 120 },
            alertRain: { type: "boolean" },
            alertSnow: { type: "boolean" },
            alertHail: { type: "boolean" },
            alertThunder: { type: "boolean" },
            alertWind: { type: "boolean" },
            minRainIntensity: {
              type: "string",
              enum: ["light", "moderate", "heavy"],
            },
            notificationsOn: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const updated = await prisma.userPreferences.update({
        where: { userId: request.userId },
        data: request.body,
      });
      return reply.send(updated);
    },
  );
}
