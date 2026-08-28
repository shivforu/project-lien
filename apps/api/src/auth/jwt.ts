import jwt from "jsonwebtoken";
import type { OrgRole } from "@project-lien/db";

export interface AccessTokenClaims {
  sub: string; // user id
  organizationId: string;
  role: OrgRole;
}

/**
 * Local JWT issuance/verification (docs/SECURITY.md — this project uses local JWTs
 * rather than a real IdP like Auth0/Okta; see docs/EXTERNAL_DEPENDENCIES.md). Access
 * tokens are short-lived; refresh tokens are opaque-to-the-client but structurally the
 * same JWT with a longer expiry and a different signing secret, so a leaked access token
 * cannot be replayed as a refresh token.
 */
export function signAccessToken(claims: AccessTokenClaims, secret: string): string {
  return jwt.sign(claims, secret, { expiresIn: "15m" });
}

export function signRefreshToken(claims: AccessTokenClaims, secret: string): string {
  return jwt.sign(claims, secret, { expiresIn: "7d" });
}

export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTokenError";
  }
}

export function verifyToken(token: string, secret: string): AccessTokenClaims {
  try {
    return jwt.verify(token, secret) as unknown as AccessTokenClaims;
  } catch (err) {
    throw new InvalidTokenError(err instanceof Error ? err.message : "Invalid token");
  }
}
