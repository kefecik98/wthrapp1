// RevenueCat subscription webhook (weather-app-spec.md section 6.4).
//
// Auth model: RevenueCat does NOT HMAC-sign webhook payloads. Its
// documented mechanism is a static Authorization header value that you
// configure in the RevenueCat dashboard and verify on receipt. So a
// constant-time comparison of that header against our shared secret IS
// the correct, complete verification — there is no signature to check.
// Set REVENUECAT_WEBHOOK_SECRET to the exact header value (including any
// "Bearer " prefix) configured in the dashboard.

import { timingSafeEqual } from "node:crypto";
import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { config } from "../config";

// RevenueCat event envelope (only the fields we use).
interface RevenueCatWebhook {
  event: {
    type: string;
    app_user_id: string;
    product_id?: string;
    expiration_at_ms?: number;
  };
}

/** Constant-time string comparison that tolerates length differences. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Body schema. This is the only route whose payload comes from a third
// party, so validate the fields we act on at the boundary instead of letting
// them reach Prisma untyped. `additionalProperties` stays open deliberately:
// RevenueCat sends far more fields than we consume and adds new ones over
// time, so rejecting unknown fields would break the hook on their next
// release. We pin the shape of what we *read*, not the whole envelope.
const webhookBodySchema = {
  type: "object",
  required: ["event"],
  properties: {
    event: {
      type: "object",
      required: ["type", "app_user_id"],
      properties: {
        type: { type: "string", minLength: 1 },
        app_user_id: { type: "string", minLength: 1 },
        product_id: { type: "string" },
        expiration_at_ms: { type: "integer", minimum: 0 },
      },
    },
  },
} as const;

// Map a RevenueCat event type to our subscription status.
function statusForEvent(type: string): string | null {
  switch (type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
      return "active";
    case "TRIAL":
      return "trial";
    case "CANCELLATION":
      return "cancelled";
    case "EXPIRATION":
      return "expired";
    default:
      return null; // events we don't act on (e.g. BILLING_ISSUE, TEST)
  }
}

export default async function webhookRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post<{ Body: RevenueCatWebhook }>(
    "/webhooks/revenuecat",
    {
      schema: { body: webhookBodySchema },
      // Check the shared secret in onRequest, i.e. before schema validation,
      // so an unauthenticated caller gets a flat 401 and learns nothing about
      // the payload shape from validation errors.
      onRequest: async (request, reply) => {
        const auth = request.headers.authorization ?? "";
        if (!secretMatches(auth, config.revenueCat.webhookSecret)) {
          return reply.code(401).send({ error: "Invalid webhook signature" });
        }
      },
    },
    async (request, reply) => {
      const event = request.body.event;

      const status = statusForEvent(event.type);
      if (!status) {
        // Acknowledge so RevenueCat does not retry events we ignore.
        return reply.code(204).send();
      }

      // The client sets the RevenueCat app_user_id to our user id.
      const userId = event.app_user_id;
      const expiresAt = event.expiration_at_ms
        ? new Date(event.expiration_at_ms)
        : null;

      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          status,
          plan: event.product_id ?? null,
          expiresAt,
          revenuecatUserId: event.app_user_id,
        },
        update: {
          status,
          plan: event.product_id ?? undefined,
          expiresAt,
          revenuecatUserId: event.app_user_id,
        },
      });

      return reply.code(204).send();
    },
  );
}
