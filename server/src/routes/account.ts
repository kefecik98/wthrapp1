// Account route: lets an authenticated user permanently delete their account.
// Required by Apple App Store (5.1.1(v)) and Google Play's Data Deletion
// policy for any app that supports account creation.
//
// Deleting the `users` row is sufficient: every child table
// (subscriptions, user_locations, user_preferences, alert_log) has an
// `onDelete: Cascade` FK, and the FCM push token lives on the user row, so it
// all goes in one delete. Once the row is gone, `authenticate` and
// /auth/refresh reject the user's outstanding tokens (user-not-found), so no
// separate session invalidation is needed.

import { FastifyInstance } from "fastify";
import { prisma } from "../db";

export default async function accountRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.delete(
    "/account",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      await prisma.user.delete({ where: { id: request.userId } });
      return reply.code(204).send();
    },
  );
}
