import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { signAccessToken, signRefreshToken, verifyToken, InvalidTokenError, type AccessTokenClaims } from "./jwt.js";

/**
 * `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` were documented in `.env.example` since Phase 1 but
 * never actually wired to the signing calls until Phase 13 (docs/DECISIONS.md D19) — this
 * verifies the TTL parameter genuinely reaches the signed token's `exp` claim, not just
 * that the function compiles and returns *a* token.
 */
const claims: AccessTokenClaims = { sub: "user-1", organizationId: "org-1", role: "ORG_ADMIN" };
const secret = "test-secret";

describe("signAccessToken / signRefreshToken TTL wiring", () => {
  it("defaults to a 15-minute access token expiry", () => {
    const token = signAccessToken(claims, secret);
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  it("honors a custom access-token TTL", () => {
    const token = signAccessToken(claims, secret, "2h");
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(2 * 60 * 60);
  });

  it("defaults to a 7-day refresh token expiry", () => {
    const token = signRefreshToken(claims, secret);
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
  });

  it("honors a custom refresh-token TTL", () => {
    const token = signRefreshToken(claims, secret, "30d");
    const decoded = jwt.decode(token) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(30 * 24 * 60 * 60);
  });

  it("verifyToken rejects a token signed with a different secret", () => {
    const token = signAccessToken(claims, secret);
    expect(() => verifyToken(token, "wrong-secret")).toThrow(InvalidTokenError);
  });

  it("verifyToken rejects an already-expired token", () => {
    const token = jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 10 }, secret);
    expect(() => verifyToken(token, secret)).toThrow(InvalidTokenError);
  });
});
