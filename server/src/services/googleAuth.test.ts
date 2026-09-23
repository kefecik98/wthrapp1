// Unit tests for the Google ID-token verifier's email_verified gate.
// google-auth-library is mocked so we don't hit Google; we only assert how
// the verifier maps the verified-token payload onto our SocialIdentity.

import { afterEach, describe, expect, it, vi } from "vitest";

const { mockVerifyIdToken } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

// Pretend Google sign-in is configured (a non-empty audience list).
vi.mock("../config", () => ({
  config: { social: { googleClientIds: ["test-audience"] } },
}));

import { verifyGoogleToken } from "./googleAuth";

function ticketWith(payload: Record<string, unknown>) {
  return { getPayload: () => payload };
}

afterEach(() => mockVerifyIdToken.mockReset());

describe("verifyGoogleToken email_verified gate", () => {
  it("returns the email when Google reports it verified", async () => {
    mockVerifyIdToken.mockResolvedValueOnce(
      ticketWith({ sub: "g-1", email: "a@example.com", email_verified: true }),
    );
    await expect(verifyGoogleToken("token")).resolves.toEqual({
      sub: "g-1",
      email: "a@example.com",
    });
  });

  it("drops an unverified email (account-takeover guard)", async () => {
    mockVerifyIdToken.mockResolvedValueOnce(
      ticketWith({
        sub: "g-2",
        email: "victim@example.com",
        email_verified: false,
      }),
    );
    await expect(verifyGoogleToken("token")).resolves.toEqual({
      sub: "g-2",
      email: undefined,
    });
  });

  it("throws when the payload has no subject", async () => {
    mockVerifyIdToken.mockResolvedValueOnce(ticketWith({ email: "x@example.com" }));
    await expect(verifyGoogleToken("token")).rejects.toThrow("Invalid Google token");
  });
});
