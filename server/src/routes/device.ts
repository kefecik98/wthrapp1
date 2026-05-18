// Device route: the client registers (and refreshes) its FCM push token
// here. The alert engine reads `user.fcmToken` to deliver notifications,
// so the client must call this after login and on every token rotation.

import { FastifyInstance } from "fastify";
import { prisma } from "../db";

interface DeviceTokenBody {
  fcmToken: string;
}

export default async function deviceRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.put<{ Body: DeviceTokenBody }>(
    "/device/token",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["fcmToken"],
          properties: { fcmToken: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      await prisma.user.update({
        where: { id: request.userId },
        data: { fcmToken: request.body.fcmToken },
      });
      return reply.code(204).send();
    },
  );
}
