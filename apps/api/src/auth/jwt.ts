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
// jsonwebtoken's own types constrain `expiresIn` to a template-literal `StringValue`
// (from the `ms` package) that a plain runtime `string` can't statically satisfy, even
// though the value is only ever a config-supplied duration string. The env schema
// enforces that shape at runtime (`JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` — see
// packages/shared-config/src/env.ts), so the cast here is safe.
function asExpiresIn(ttl: string): jwt.SignOptions["expiresIn"] {
  return ttl as jwt.SignOptions["expiresIn"];
}

export function signAccessToken(claims: AccessTokenClaims, secret: string, ttl = "15m"): string {
  return jwt.sign(claims, secret, { expiresIn: asExpiresIn(ttl) });
}

export function signRefreshToken(claims: AccessTokenClaims, secret: string, ttl = "7d"): string {
  return jwt.sign(claims, secret, { expiresIn: asExpiresIn(ttl) });
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
