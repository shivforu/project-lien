import { Router } from "express";
import { z } from "zod";
import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import type { Env } from "@project-lien/shared-config";
import { verifyPassword } from "../auth/password.js";
import { signAccessToken, signRefreshToken } from "../auth/jwt.js";
import { asyncHandler } from "../async-handler.js";
import { recordAuditEvent } from "@project-lien/domain-workflow";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

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
      accessToken: signAccessToken(claims, env.JWT_ACCESS_SECRET),
      refreshToken: signRefreshToken(claims, env.JWT_REFRESH_SECRET),
      user: { id: user.id, email: user.email, fullName: user.full_name, role: membership.role, organizationId: membership.organization_id },
    });
  }));

  return router;
}
