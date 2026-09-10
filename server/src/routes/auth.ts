// Auth routes: register, login, refresh.
// On register a user is created together with a default preferences row.

import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  signTokenPair,
  verifyRefreshToken,
} from "../lib/tokens";

interface CredentialsBody {
  email: string;
  password: string;
}

const credentialsSchema = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 8 },
  },
} as const;

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // Create a new account.
  app.post<{ Body: CredentialsBody }>(
    "/auth/register",
    { schema: { body: credentialsSchema } },
    async (request, reply) => {
      const email = request.body.email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({ error: "Email already registered" });
      }

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(request.body.password),
          // Every user gets a default preferences row up front.
          preferences: { create: {} },
        },
      });

      return reply.code(201).send(signTokenPair(user.id, user.tokenVersion));
    },
  );

  // Exchange credentials for a fresh token pair.
  app.post<{ Body: CredentialsBody }>(
    "/auth/login",
    { schema: { body: credentialsSchema } },
    async (request, reply) => {
      const email = request.body.email.toLowerCase().trim();

      const user = await prisma.user.findUnique({ where: { email } });
      // user.passwordHash is null for social-only (Apple/Google) accounts —
      // those must sign in through their provider, not with a password.
      if (
        !user ||
        !user.passwordHash ||
        !(await verifyPassword(request.body.password, user.passwordHash))
      ) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      return reply.send(signTokenPair(user.id, user.tokenVersion));
    },
  );

  // Exchange a valid refresh token for a new token pair.
  app.post<{ Body: { refreshToken: string } }>(
    "/auth/refresh",
    {
      schema: {
        body: {
          type: "object",
          required: ["refreshToken"],
          properties: { refreshToken: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      try {
        const payload = verifyRefreshToken(request.body.refreshToken);
        // Reject if the user was deleted or their tokens were revoked since
        // this refresh token was issued — otherwise a stale or leaked refresh
        // token could keep minting access tokens indefinitely.
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, tokenVersion: true },
        });
        if (!user || user.tokenVersion !== payload.tv) {
          return reply
            .code(401)
            .send({ error: "Invalid or expired refresh token" });
        }
        return reply.send(signTokenPair(user.id, user.tokenVersion));
      } catch {
        return reply
          .code(401)
          .send({ error: "Invalid or expired refresh token" });
      }
    },
  );
}
