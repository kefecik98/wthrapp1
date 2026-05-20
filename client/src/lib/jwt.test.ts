// Unit tests for decodeJwtSub.

import { decodeJwtSub } from "./jwt";

// Helper: build a JWT-shaped string with `payload` as the middle segment.
// The signature segment is irrelevant — decodeJwtSub never verifies it.
function jwtWith(payload: object): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${b64}.sig`;
}

describe("decodeJwtSub", () => {
  it("returns null for null / empty input", () => {
    expect(decodeJwtSub(null)).toBeNull();
    expect(decodeJwtSub("")).toBeNull();
  });

  it("returns null for a string without three segments", () => {
    expect(decodeJwtSub("not-a-jwt")).toBeNull();
  });

  it("extracts the sub claim from a valid token", () => {
    expect(decodeJwtSub(jwtWith({ sub: "user-abc-123" }))).toBe("user-abc-123");
  });

  it("returns null when the payload has no sub", () => {
    expect(decodeJwtSub(jwtWith({ name: "Alice" }))).toBeNull();
  });

  it("handles URL-safe base64 (- and _ in place of + and /)", () => {
    // Construct a payload whose base64 contains '+' or '/' so the URL-safe
    // replacement path is exercised. JSON containing '?' yields a '/' in
    // standard base64.
    const json = '{"sub":"u/1?"}';
    const urlSafe = Buffer.from(json)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(decodeJwtSub(`h.${urlSafe}.s`)).toBe("u/1?");
  });

  it("returns null for an invalid base64 / JSON payload", () => {
    expect(decodeJwtSub("header.not-base64-json.sig")).toBeNull();
  });
});
