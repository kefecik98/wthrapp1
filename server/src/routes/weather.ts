// Weather route: returns the short-term forecast for the user's last
// known location, for the in-app weather display.

import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { getMinutely } from "../services/forecastCache";

export default async function weatherRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/weather",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const location = await prisma.userLocation.findUnique({
        where: { userId: request.userId },
      });
      if (!location) {
        return reply
          .code(404)
          .send({ error: "No location on file — send a location first" });
      }

      try {
        // Shares the alert engine's grid-cell cache, so opening the app
        // usually costs no Tomorrow.io call at all.
        const minutes = await getMinutely(location.lat, location.lng);
        return reply.send({
          location: { lat: location.lat, lng: location.lng },
          updatedAt: location.updatedAt,
          minutely: minutes,
        });
      } catch (err) {
        request.log.error(err, "weather fetch failed");
        return reply
          .code(502)
          .send({ error: "Weather provider unavailable" });
      }
    },
  );
}
