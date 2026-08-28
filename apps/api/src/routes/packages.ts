import { Router } from "express";
import { z } from "zod";
import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import { calculateStatutoryDeadline, findCountyRule, findStateRule, resolveJurisdictionRule } from "@project-lien/domain-jurisdiction";
import { requireRole, type AuthenticatedRequest } from "../auth/middleware.js";
import { asyncHandler } from "../async-handler.js";

const createPackageSchema = z.object({
  packageIdentifier: z.string().min(1),
  loanId: z.string().uuid(),
  propertyId: z.string().uuid(),
  stateCode: z.string().length(2),
  countyFips: z.string().min(1),
  settlementDate: z.string().datetime().optional(),
});

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
 * "Releases" = recording packages (docs/API.md naming — this is the customer-facing term
 * for a lien release package). Every route here is tenant-scoped to `req.auth.organizationId`
 * (docs/REQUIREMENTS_MATRIX.md #33) — there is no way to query another org's packages
 * through this router even with a valid token for a different org.
 */
export function createPackagesRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get("/", asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const cursor = typeof req.query.cursor === "string" ? decodeCursor(req.query.cursor) : null;

    let query = db
      .selectFrom("recording_packages")
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

  router.get("/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
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
    res.status(200).json({ data: pkg });
  }));

  router.post("/", requireRole("ORG_ADMIN", "OPERATOR"), asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = createPackageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.issues } });
      return;
    }

    // Idempotent create: retrying a create with the same packageIdentifier returns the
    // existing row rather than erroring (docs/API.md idempotency conventions) — this
    // project scopes idempotency to the caller-supplied, org-unique packageIdentifier
    // rather than a separate Idempotency-Key header/table.
    const existing = await db
      .selectFrom("recording_packages")
      .selectAll()
      .where("organization_id", "=", req.auth!.organizationId)
      .where("package_identifier", "=", parsed.data.packageIdentifier)
      .executeTakeFirst();
    if (existing) {
      res.status(200).json({ data: existing });
      return;
    }

    const state = await findStateRule(db, parsed.data.stateCode);
    if (!state) {
      res.status(422).json({ error: { code: "UNKNOWN_JURISDICTION", message: `No jurisdiction rule for state '${parsed.data.stateCode}'` } });
      return;
    }
    const county = await findCountyRule(db, parsed.data.countyFips);
    const resolved = resolveJurisdictionRule(state, county);
    const settlementDate = parsed.data.settlementDate ? new Date(parsed.data.settlementDate) : new Date();
    const statutoryDeadline = calculateStatutoryDeadline(settlementDate, resolved);

    const created = await db
      .insertInto("recording_packages")
      .values({
        organization_id: req.auth!.organizationId,
        package_identifier: parsed.data.packageIdentifier,
        loan_id: parsed.data.loanId,
        property_id: parsed.data.propertyId,
        state_code: parsed.data.stateCode,
        county_fips: parsed.data.countyFips,
        document_type: resolved.docType,
        statutory_deadline: statutoryDeadline,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db
      .insertInto("workflow_events")
      .values({ package_id: created.id, from_status: null, to_status: "DRAFT", actor: "USER", reason: "Package created", metadata: null })
      .execute();

    res.status(201).json({ data: created });
  }));

  return router;
}
