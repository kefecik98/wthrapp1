// Location route: the mobile client pushes the device's GPS position here.
// Upserts a single row per user (see weather-app-spec.md section 6.2).

import { FastifyInstance } from "fastify";
import { prisma } from "../db";

interface LocationBody {
  lat: number;
  lng: number;
  accuracy?: number;
}

export default async function locationRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.put<{ Body: LocationBody }>(
    "/location",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["lat", "lng"],
          properties: {
            lat: { type: "number", minimum: -90, maximum: 90 },
            lng: { type: "number", minimum: -180, maximum: 180 },
            accuracy: { type: "number" },
          },
        },
      },
    },
    async (request, reply) => {
      const { lat, lng, accuracy } = request.body;

      await prisma.userLocation.upsert({
        where: { userId: request.userId },
        create: { userId: request.userId, lat, lng, accuracyM: accuracy },
        update: { lat, lng, accuracyM: accuracy },
      });

      return reply.code(204).send();
    },
  );
}
