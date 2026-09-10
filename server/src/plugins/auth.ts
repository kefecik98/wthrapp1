// Authentication plugin.
// Adds an `authenticate` preHandler that validates the Bearer access token
// and attaches the resolved user id to the request.

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { prisma } from "../db";
import { verifyAccessToken } from "../lib/tokens";

// Augment Fastify types so `request.userId` and `app.authenticate` are typed.
declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest("userId", "");

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const header = request.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        return reply
          .code(401)
          .send({ error: "Missing or malformed Authorization header" });
      }

      try {
        const payload = verifyAccessToken(header.slice("Bearer ".length));
        // Confirm the user still exists and the token hasn't been revoked:
        // tokenVersion is bumped on logout-all / password change / account
        // deletion, which invalidates every token issued before the bump.
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, tokenVersion: true },
        });
        if (!user || user.tokenVersion !== payload.tv) {
          return reply.code(401).send({ error: "Invalid or expired token" });
        }
        request.userId = user.id;
      } catch {
        return reply.code(401).send({ error: "Invalid or expired token" });
      }
    },
  );
}

// `fastify-plugin` keeps the decorators available outside this plugin's scope.
export default fp(authPlugin);
