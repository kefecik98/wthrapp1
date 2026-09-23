// Unit tests for the Apple ID-token verifier's email_verified gate.
// jsonwebtoken + jwks-rsa are mocked so we never hit Apple's JWKS; the mock
// `verify` invokes its callback with a chosen payload, letting us assert how
// the verifier maps it onto our SocialIdentity.

import { afterEach, describe, expect, it, vi } from "vitest";

const { mockJwtVerify } = vi.hoisted(() => ({
  mockJwtVerify: vi.fn(),
}));

vi.mock("jsonwebtoken", () => ({
  default: { verify: mockJwtVerify },
}));

vi.mock("jwks-rsa", () => ({
  default: vi.fn(() => ({ getSigningKey: vi.fn() })),
}));

vi.mock("../config", () => ({
  config: { social: { appleClientId: "com.weatheralert.app" } },
}));

import { verifyAppleToken } from "./appleAuth";

/** Make the mocked jwt.verify(token, getKey, opts, cb) resolve with `payload`. */
function resolveWith(payload: Record<string, unknown>) {
  mockJwtVerify.mockImplementationOnce((_token, _getKey, _opts, cb) =>
    cb(null, payload),
  );
}

afterEach(() => mockJwtVerify.mockReset());

describe("verifyAppleToken email_verified gate", () => {
  it("returns the email when email_verified is the string \"true\"", async () => {
    resolveWith({ sub: "a-1", email: "a@privaterelay.appleid.com", email_verified: "true" });
    await expect(verifyAppleToken("token")).resolves.toEqual({
      sub: "a-1",
      email: "a@privaterelay.appleid.com",
    });
  });

  it("returns the email when email_verified is boolean true", async () => {
    resolveWith({ sub: "a-2", email: "b@example.com", email_verified: true });
    await expect(verifyAppleToken("token")).resolves.toEqual({
      sub: "a-2",
      email: "b@example.com",
    });
  });

  it("drops an unverified email (account-takeover guard)", async () => {
    resolveWith({ sub: "a-3", email: "victim@example.com", email_verified: false });
    await expect(verifyAppleToken("token")).resolves.toEqual({
      sub: "a-3",
      email: undefined,
    });
  });

  it("rejects when verification fails", async () => {
    mockJwtVerify.mockImplementationOnce((_token, _getKey, _opts, cb) =>
      cb(new Error("invalid signature")),
    );
    await expect(verifyAppleToken("token")).rejects.toBeTruthy();
  });
});
