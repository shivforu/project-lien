import { Router } from "express";
import { z } from "zod";
import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import type { Env } from "@project-lien/shared-config";
import { verifyPassword } from "../auth/password.js";
import { signAccessToken, signRefreshToken, verifyToken, InvalidTokenError } from "../auth/jwt.js";
import { asyncHandler } from "../async-handler.js";
import { recordAuditEvent } from "@project-lien/domain-workflow";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export function createAuthRouter(db: Kysely<Database>, env: Env): Router {
  const router = Router();

  router.post("/login", asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.issues } });
      return;
    }

    const user = await db.selectFrom("users").selectAll().where("email", "=", parsed.data.email).executeTakeFirst();
    if (!user || !user.is_active) {
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
      return;
    }

    const valid = await verifyPassword(parsed.data.password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
      return;
    }

    const membership = await db
      .selectFrom("org_memberships")
      .selectAll()
      .where("user_id", "=", user.id)
      .executeTakeFirst();
    if (!membership) {
      res.status(403).json({ error: { code: "NO_ORGANIZATION", message: "User has no organization membership" } });
      return;
    }

    const claims = { sub: user.id, organizationId: membership.organization_id, role: membership.role };

    await recordAuditEvent(db, {
      organizationId: membership.organization_id,
      actorType: "USER",
      actorUserId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
    });

    res.status(200).json({
      accessToken: signAccessToken(claims, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_TTL),
      refreshToken: signRefreshToken(claims, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_TTL),
      user: { id: user.id, email: user.email, fullName: user.full_name, role: membership.role, organizationId: membership.organization_id },
    });
  }));

  // A refresh token had been issued by /login since Phase 1 but nothing ever consumed it —
  // an access token expiring after its 15-minute TTL had no way to be renewed short of
  // logging in again. Re-derives claims from the database rather than trusting the ones
  // embedded in the presented refresh token, so a role change or deactivation since the
  // token was issued takes effect immediately rather than only at the token's 7-day expiry
  // (docs/DECISIONS.md D19).
  router.post("/refresh", asyncHandler(async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.issues } });
      return;
    }

    let claims;
    try {
      claims = verifyToken(parsed.data.refreshToken, env.JWT_REFRESH_SECRET);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        res.status(401).json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Invalid or expired refresh token" } });
        return;
      }
      throw err;
    }

    const user = await db.selectFrom("users").selectAll().where("id", "=", claims.sub).executeTakeFirst();
    if (!user || !user.is_active) {
      res.status(401).json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Account is no longer active" } });
      return;
    }
    const membership = await db
      .selectFrom("org_memberships")
      .selectAll()
      .where("user_id", "=", user.id)
      .where("organization_id", "=", claims.organizationId)
      .executeTakeFirst();
    if (!membership) {
      res.status(401).json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Organization membership no longer exists" } });
      return;
    }

    const freshClaims = { sub: user.id, organizationId: membership.organization_id, role: membership.role };
    res.status(200).json({
      accessToken: signAccessToken(freshClaims, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_TTL),
      refreshToken: signRefreshToken(freshClaims, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_TTL),
    });
  }));

  return router;
}
