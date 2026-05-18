// Social sign-in routes: POST /auth/apple and POST /auth/google.
// Each verifies the provider identity token, finds-or-creates the user
// (keyed by the provider-verified email), and returns our JWT pair.
//
// KNOWN LIMITATION: accounts are matched by email. Apple emails can be
// private-relay addresses and Apple only reliably includes the email claim
// on first authorization. A fully robust implementation would also persist
// the provider `sub` as a stable external id (new column + migration);
// tracked as a follow-up so this change stays focused.

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db";
import { signTokenPair } from "../lib/tokens";
import { verifyAppleToken, SocialIdentity } from "../services/appleAuth";
import { verifyGoogleToken } from "../services/googleAuth";

const bodySchema = {
  type: "object",
  required: ["idToken"],
  properties: { idToken: { type: "string", minLength: 1 } },
} as const;

// Find the user by email, or create a social-only account (no password)
// with the usual default preferences row. Returns the user id.
async function findOrCreateUser(email: string): Promise<string> {
  const normalised = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({
    where: { email: normalised },
  });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      email: normalised,
      passwordHash: null,
      preferences: { create: {} },
    },
  });
  return created.id;
}

export default async function socialRoutes(
  app: FastifyInstance,
): Promise<void> {
  // Shared handler: given a verifier, run the verify -> find-or-create flow.
  const handle =
    (verify: (idToken: string) => Promise<SocialIdentity>) =>
    async (
      request: FastifyRequest<{ Body: { idToken: string } }>,
      reply: FastifyReply,
    ) => {
      let identity: SocialIdentity;
      try {
        identity = await verify(request.body.idToken);
      } catch (err) {
        const message = (err as Error).message;
        // Not configured -> 501; anything else -> bad/expired token.
        const code = message.includes("not configured") ? 501 : 401;
        return reply.code(code).send({ error: message });
      }

      if (!identity.email) {
        return reply
          .code(400)
          .send({ error: "Provider did not supply an email address" });
      }

      const userId = await findOrCreateUser(identity.email);
      return reply.send(signTokenPair(userId));
    };

  app.post<{ Body: { idToken: string } }>(
    "/auth/apple",
    { schema: { body: bodySchema } },
    handle(verifyAppleToken),
  );

  app.post<{ Body: { idToken: string } }>(
    "/auth/google",
    { schema: { body: bodySchema } },
    handle(verifyGoogleToken),
  );
}
