// DEV-ONLY routes. Registered only when NODE_ENV !== 'production'
// (see index.ts), so these endpoints do not exist in a production build.
//
// In production, subscription state is owned exclusively by RevenueCat via
// the webhook. That makes a freshly registered account unable to receive
// alerts during local testing (the alert engine skips users without an
// active/trial subscription). This route lets a test account self-provision
// a subscription so the full alert flow can be exercised end to end.

import { FastifyInstance } from "fastify";
import { prisma } from "../db";

interface SeedBody {
  status?: "active" | "trial";
  days?: number;
}

export default async function devRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post<{ Body: SeedBody }>(
    "/dev/seed-subscription",
    {
      onRequest: [app.authenticate],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["active", "trial"] },
            days: { type: "integer", minimum: 1, maximum: 365 },
          },
        },
      },
    },
    async (request, reply) => {
      const status = request.body.status ?? "trial";
      const days = request.body.days ?? 30;
      const expiresAt = new Date(Date.now() + days * 86_400_000);

      const subscription = await prisma.subscription.upsert({
        where: { userId: request.userId },
        create: {
          userId: request.userId,
          status,
          plan: "dev",
          expiresAt,
        },
        update: { status, plan: "dev", expiresAt },
      });

      return reply.send(subscription);
    },
  );
}
