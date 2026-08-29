import { Router } from "express";
import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import type { AuthenticatedRequest } from "../auth/middleware.js";
import { asyncHandler } from "../async-handler.js";

/**
 * Connector/integration health (docs/REQUIREMENTS_MATRIX.md #30 — "Integrations/connector
 * health UI"). This is a read model over `integration_connections`: rows are seeded per
 * organization for the connectors this project actually has adapters/interfaces for
 * (ERECORDING vendors via packages/adapters-erecording, plus the LOS/TMS and document
 * storage interface stubs in packages/adapters-los and packages/adapters-storage —
 * docs/REQUIREMENTS_MATRIX.md #34/#35). `health` is not live-probed here; it reflects the
 * value the worker/adapters last wrote, same convention as `/ready`.
 */
export function createIntegrationsRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get("/", asyncHandler(async (req: AuthenticatedRequest, res) => {
    const connections = await db
      .selectFrom("integration_connections")
      .select(["id", "connector_type", "vendor", "health", "last_checked_at", "created_at", "updated_at"])
      .where("organization_id", "=", req.auth!.organizationId)
      .orderBy("connector_type", "asc")
      .execute();

    res.status(200).json({ data: connections });
  }));

  return router;
}
