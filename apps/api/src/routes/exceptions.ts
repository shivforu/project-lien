import { Router } from "express";
import type { Kysely } from "kysely";
import type { Database, PackageStatus } from "@project-lien/db";
import { assertTransition, recordAuditEvent, IllegalTransitionError } from "@project-lien/domain-workflow";
import { requireRole, type AuthenticatedRequest } from "../auth/middleware.js";
import { asyncHandler } from "../async-handler.js";

/**
 * The exception center (docs/API.md `GET/POST /api/v1/exceptions*`,
 * docs/REQUIREMENTS_MATRIX.md #23/#27): a single tenant-scoped view aggregating the two
 * things an operator has to manually intervene on — packages stuck in REJECTED /
 * RESUBMISSION_REQUIRED, and jobs that exhausted retries into DEAD_LETTER
 * (docs/DECISIONS.md D3 — this is the Postgres-backed queue's terminal failure state).
 *
 * "Resolve" is deliberately narrow: it advances a package one step along the recovery
 * path the state machine already defines (REJECTED -> RESUBMISSION_REQUIRED ->
 * VALIDATING), or resets a dead-lettered job back to QUEUED for one more attempt. It does
 * not attempt to auto-fix the underlying cause — an operator decided that's warranted.
 */
export function createExceptionsRouter(db: Kysely<Database>): Router {
  const router = Router();

  const PACKAGE_RECOVERY_STEP: Partial<Record<PackageStatus, PackageStatus>> = {
    REJECTED: "RESUBMISSION_REQUIRED",
    RESUBMISSION_REQUIRED: "VALIDATING",
  };

  router.get("/", asyncHandler(async (req: AuthenticatedRequest, res) => {
    const organizationId = req.auth!.organizationId;

    const packageExceptions = await db
      .selectFrom("recording_packages")
      .select(["id", "package_identifier", "status", "statutory_deadline", "updated_at"])
      .where("organization_id", "=", organizationId)
      .where("status", "in", ["REJECTED", "RESUBMISSION_REQUIRED"])
      .orderBy("updated_at", "desc")
      .execute();

    const jobExceptions = await db
      .selectFrom("workflow_jobs")
      .innerJoin("recording_packages", "recording_packages.id", "workflow_jobs.package_id")
      .select([
        "workflow_jobs.id as id",
        "workflow_jobs.job_type as jobType",
        "workflow_jobs.attempts as attempts",
        "workflow_jobs.last_error as lastError",
        "workflow_jobs.updated_at as updatedAt",
        "recording_packages.id as packageId",
        "recording_packages.package_identifier as packageIdentifier",
      ])
      .where("workflow_jobs.status", "=", "DEAD_LETTER")
      .where("recording_packages.organization_id", "=", organizationId)
      .orderBy("workflow_jobs.updated_at", "desc")
      .execute();

    res.status(200).json({
      data: {
        packageExceptions,
        jobExceptions,
      },
    });
  }));

  router.post("/:id/resolve", requireRole("ORG_ADMIN", "OPERATOR"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "id path parameter is required" } });
      return;
    }
    const organizationId = req.auth!.organizationId;

    // An exception id is either a recording_packages.id or a workflow_jobs.id — check
    // packages first since that's the more common exception type.
    const pkg = await db
      .selectFrom("recording_packages")
      .selectAll()
      .where("id", "=", id)
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();

    if (pkg) {
      const nextStatus = PACKAGE_RECOVERY_STEP[pkg.status];
      if (!nextStatus) {
        res.status(409).json({
          error: { code: "NOT_AN_EXCEPTION", message: `Package status '${pkg.status}' is not a resolvable exception state` },
        });
        return;
      }
      try {
        assertTransition(pkg.status, nextStatus);
      } catch (err) {
        if (err instanceof IllegalTransitionError) {
          res.status(409).json({ error: { code: "ILLEGAL_TRANSITION", message: err.message } });
          return;
        }
        throw err;
      }

      const updated = await db
        .updateTable("recording_packages")
        .set({ status: nextStatus })
        .where("id", "=", pkg.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .insertInto("workflow_events")
        .values({
          package_id: pkg.id,
          from_status: pkg.status,
          to_status: nextStatus,
          actor: "USER",
          reason: "Exception resolved via exception center",
          metadata: null,
        })
        .execute();

      await recordAuditEvent(db, {
        organizationId,
        actorType: "USER",
        actorUserId: req.auth!.sub,
        action: "exception.package_resolved",
        entityType: "recording_package",
        entityId: pkg.id,
        details: { fromStatus: pkg.status, toStatus: nextStatus },
      });

      res.status(200).json({ data: updated });
      return;
    }

    const job = await db
      .selectFrom("workflow_jobs")
      .innerJoin("recording_packages", "recording_packages.id", "workflow_jobs.package_id")
      .select(["workflow_jobs.id as id", "workflow_jobs.status as status", "recording_packages.organization_id as organizationId"])
      .where("workflow_jobs.id", "=", id)
      .executeTakeFirst();

    if (!job || job.organizationId !== organizationId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: `Exception '${id}' not found` } });
      return;
    }
    if (job.status !== "DEAD_LETTER") {
      res.status(409).json({ error: { code: "NOT_AN_EXCEPTION", message: `Job status '${job.status}' is not DEAD_LETTER` } });
      return;
    }

    const updatedJob = await db
      .updateTable("workflow_jobs")
      .set({ status: "QUEUED", attempts: 0, available_at: new Date(), last_error: null, locked_at: null, locked_by: null })
      .where("id", "=", job.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await recordAuditEvent(db, {
      organizationId,
      actorType: "USER",
      actorUserId: req.auth!.sub,
      action: "exception.job_resolved",
      entityType: "workflow_job",
      entityId: job.id,
      details: { requeued: true },
    });

    res.status(200).json({ data: updatedJob });
  }));

  return router;
}
