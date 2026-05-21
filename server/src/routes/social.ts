// Social sign-in routes: POST /auth/apple and POST /auth/google.
// Each verifies the provider identity token, then resolves the account by
// the stable provider subject id (robust to Apple private-relay emails),
// falling back to email-linking, and returns our JWT pair.

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db";
import { signTokenPair } from "../lib/tokens";
import { verifyAppleToken, SocialIdentity } from "../services/appleAuth";
import { verifyGoogleToken } from "../services/googleAuth";

type Provider = "apple" | "google";

const bodySchema = {
  type: "object",
  required: ["idToken"],
  properties: { idToken: { type: "string", minLength: 1 } },
} as const;

// Resolve (or create) the user for a verified social identity:
//   1. match by (provider, sub) — the stable, email-independent key;
//   2. else link to an existing account with the same verified email;
//   3. else create a new password-less account (needs an email).
// Returns the user id, or null when a new account is needed but the
// provider supplied no email.
async function resolveSocialUser(
  provider: Provider,
  sub: string,
  email?: string,
): Promise<string | null> {
  const bySub = await prisma.user.findFirst({
    where: { provider, providerSub: sub },
  });
  if (bySub) return bySub.id;

  const normalised = email?.toLowerCase().trim();
  if (!normalised) return null;

  const byEmail = await prisma.user.findUnique({
    where: { email: normalised },
  });
  if (byEmail) {
    await prisma.user.update({
      where: { id: byEmail.id },
      data: { provider, providerSub: sub },
    });
    return byEmail.id;
  }

  const created = await prisma.user.create({
    data: {
      email: normalised,
      passwordHash: null,
      provider,
      providerSub: sub,
      preferences: { create: {} },
    },
  });
  return created.id;
}

export default async function socialRoutes(
  app: FastifyInstance,
): Promise<void> {
  // Shared handler: verify the token, then resolve the account.
  const handle =
    (provider: Provider, verify: (t: string) => Promise<SocialIdentity>) =>
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

      const userId = await resolveSocialUser(
        provider,
        identity.sub,
        identity.email,
      );
      if (!userId) {
        return reply.code(400).send({
          error: "Provider supplied no email for a new account",
        });
      }
      return reply.send(signTokenPair(userId));
    };

  app.post<{ Body: { idToken: string } }>(
    "/auth/apple",
    { schema: { body: bodySchema } },
    handle("apple", verifyAppleToken),
  );

  app.post<{ Body: { idToken: string } }>(
    "/auth/google",
    { schema: { body: bodySchema } },
    handle("google", verifyGoogleToken),
  );
}
