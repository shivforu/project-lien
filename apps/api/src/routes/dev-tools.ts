import { Router } from "express";
import type { Kysely } from "kysely";
import type { Database, PackageStatus } from "@project-lien/db";
import type { Env } from "@project-lien/shared-config";
import { assertTransition, recordAuditEvent, IllegalTransitionError } from "@project-lien/domain-workflow";
import { requireRole, type AuthenticatedRequest } from "../auth/middleware.js";
import { asyncHandler } from "../async-handler.js";

/**
 * Dev/test-only shortcuts — nothing here is a real product feature, and none of it belongs
 * in docs/API.md's target surface. It exists so a human or an automated test can actually
 * exercise the full 17-state package lifecycle despite one real, unfixed gap: nothing in
 * this codebase ever performs READY -> PENDING_SIGNATURE -> PENDING_NOTARY ->
 * READY_TO_SUBMIT, because signature/notary capture was never built
 * (docs/DECISIONS.md D17, docs/QE_QUICKSTART.md section 4). Without this, the only way to
 * see a package reach SUBMITTING/SUBMITTED/RECORDED/COMPLETE for real is to read the
 * automated test suite's own output rather than ever clicking or calling anything yourself
 * (docs/DECISIONS.md D34).
 *
 * Two safeguards keep this from ever masquerading as the real thing:
 *   1. The whole router 404s when NODE_ENV=production — this cannot run against a real
 *      deployment, only local/dev/test environments.
 *   2. Every transition it performs is written to workflow_events with actor "DEV_TOOL"
 *      (not "USER" or "SYSTEM") and a reason that says plainly this was a shortcut, so the
 *      audit trail never implies a real signature or notarization happened.
 */
const SHORTCUT_STEPS: { from: PackageStatus; to: PackageStatus }[] = [
  { from: "READY", to: "PENDING_SIGNATURE" },
  { from: "PENDING_SIGNATURE", to: "PENDING_NOTARY" },
  { from: "PENDING_NOTARY", to: "READY_TO_SUBMIT" },
];

export function createDevToolsRouter(db: Kysely<Database>, env: Env): Router {
  const router = Router();

  router.use((_req, res, next) => {
    if (env.NODE_ENV === "production") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
      return;
    }
    next();
  });

  router.post(
    "/releases/:id/advance-to-ready-to-submit",
    requireRole("ORG_ADMIN"),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "id path parameter is required" } });
        return;
      }
      const pkg = await db
        .selectFrom("recording_packages")
        .selectAll()
        .where("id", "=", id)
        .where("organization_id", "=", req.auth!.organizationId)
        .executeTakeFirst();
      if (!pkg) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: `Package '${id}' not found` } });
        return;
      }
      if (pkg.status !== "READY") {
        res.status(409).json({
          error: {
            code: "ILLEGAL_TRANSITION",
            message: `This shortcut only starts from READY (package is '${pkg.status}'). Run POST /:id/preflight first if it hasn't passed yet.`,
          },
        });
        return;
      }

      for (const step of SHORTCUT_STEPS) {
        try {
          assertTransition(step.from, step.to);
        } catch (err) {
          if (err instanceof IllegalTransitionError) {
            // The state machine itself changed underneath this shortcut — fail loudly
            // rather than silently writing a status the state machine no longer allows.
            res.status(500).json({
              error: { code: "INTERNAL_ERROR", message: `Dev shortcut is out of date with the state machine: ${err.message}` },
            });
            return;
          }
          throw err;
        }
        await db.updateTable("recording_packages").set({ status: step.to, updated_at: new Date() }).where("id", "=", pkg.id).execute();
        await db
          .insertInto("workflow_events")
          .values({
            package_id: pkg.id,
            from_status: step.from,
            to_status: step.to,
            actor: "DEV_TOOL",
            reason:
              "Dev-only test shortcut (POST /dev/releases/:id/advance-to-ready-to-submit) — signature/notary capture is not implemented, this did not really happen (docs/DECISIONS.md D34).",
            metadata: null,
          })
          .execute();
      }

      await recordAuditEvent(db, {
        organizationId: req.auth!.organizationId,
        actorType: "USER",
        actorUserId: req.auth!.sub,
        action: "dev_tool.advance_to_ready_to_submit",
        entityType: "recording_package",
        entityId: pkg.id,
        details: { note: "Bypassed unimplemented signature/notary capture for testing (docs/DECISIONS.md D34)." },
      });

      const updated = await db.selectFrom("recording_packages").selectAll().where("id", "=", pkg.id).executeTakeFirstOrThrow();
      res.status(200).json({
        data: updated,
        warning: "This used a dev-only test shortcut, not a real signature/notary capture. See docs/DECISIONS.md D34.",
      });
    }),
  );

  return router;
}
