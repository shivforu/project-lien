import { Router } from "express";
import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import { requireRole, type AuthenticatedRequest } from "../auth/middleware.js";
import { asyncHandler } from "../async-handler.js";

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Read-only, append-only audit trail (docs/REQUIREMENTS_MATRIX.md Phase 11 — exception
 * center + audit). Restricted to ORG_ADMIN: audit events can reveal other users' actions
 * within the org (docs/SECURITY.md). System-level events (organization_id IS NULL, e.g.
 * worker lifecycle) are never exposed here — this endpoint is tenant-scoped only.
 */
export function createAuditEventsRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get("/", requireRole("ORG_ADMIN"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const cursor = typeof req.query.cursor === "string" ? decodeCursor(req.query.cursor) : null;

    let query = db
      .selectFrom("audit_events")
      .selectAll()
      .where("organization_id", "=", req.auth!.organizationId)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1);

    if (cursor) {
      const cursorCreatedAt = new Date(cursor.createdAt);
      const cursorId = cursor.id;
      query = query.where(({ eb, and, or }) =>
        or([and([eb("created_at", "=", cursorCreatedAt), eb("id", "<", cursorId)]), eb("created_at", "<", cursorCreatedAt)]),
      );
    }

    const rows = await query.execute();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(new Date(page[page.length - 1]!.created_at), page[page.length - 1]!.id) : null;

    res.status(200).json({ data: page, pagination: { nextCursor, hasMore } });
  }));

  return router;
}
