import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import type { AuthenticatedRequest } from "../auth/middleware.js";
import { asyncHandler } from "../async-handler.js";
import { recordAuditEvent } from "@project-lien/domain-workflow";

const createEndpointSchema = z.object({
  url: z.string().url(),
  subscribedEvents: z.array(z.string()).min(1),
});

export function createWebhooksRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get("/", asyncHandler(async (req: AuthenticatedRequest, res) => {
    const endpoints = await db
      .selectFrom("webhook_endpoints")
      .select(["id", "url", "subscribed_events", "is_active", "created_at"])
      .where("organization_id", "=", req.auth!.organizationId)
      .execute();
    res.status(200).json({ data: endpoints });
  }));

  router.post("/", asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = createEndpointSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.issues } });
      return;
    }

    const secret = randomBytes(32).toString("hex");
    const created = await db
      .insertInto("webhook_endpoints")
      .values({
        organization_id: req.auth!.organizationId,
        url: parsed.data.url,
        secret,
        subscribed_events: parsed.data.subscribedEvents,
      })
      .returning(["id", "url", "subscribed_events", "is_active", "created_at"])
      .executeTakeFirstOrThrow();

    await recordAuditEvent(db, {
      organizationId: req.auth!.organizationId,
      actorType: "USER",
      actorUserId: req.auth!.sub,
      action: "webhook_endpoint.created",
      entityType: "webhook_endpoint",
      entityId: created.id,
      details: { url: created.url, subscribedEvents: created.subscribed_events },
    });

    // The secret is only ever shown once, at creation — it is not returned by GET.
    res.status(201).json({ data: { ...created, secret } });
  }));

  return router;
}
