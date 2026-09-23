// Location route: the mobile client pushes the device's grid cell here.
// Upserts a single row per user (see weather-app-spec.md section 6.2).
//
// The client already snaps to the location grid on the phone; we snap again
// so an exact position is never stored, whatever sent it (older app builds,
// curl). Accuracy is dropped for the same reason — it describes a GPS fix
// we deliberately don't keep.

import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { snapToGrid } from "../lib/grid";

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
      const { lat, lng } = snapToGrid(request.body.lat, request.body.lng);

      await prisma.userLocation.upsert({
        where: { userId: request.userId },
        create: { userId: request.userId, lat, lng, accuracyM: null },
        update: { lat, lng, accuracyM: null },
      });

      return reply.code(204).send();
    },
  );
}
