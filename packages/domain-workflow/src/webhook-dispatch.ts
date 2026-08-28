import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import { enqueueJob } from "./job-queue.js";

/**
 * Fans an event out to every active webhook endpoint an org has subscribed to it
 * (docs/REQUIREMENTS_MATRIX.md #22, docs/API.md's outbound event list). Each endpoint
 * gets its own `webhook_deliveries` row (the permanent delivery record) and its own
 * `WEBHOOK_DELIVERY` job — keyed by that row's id as the idempotency key, so re-running
 * this function for an event that was already dispatched to a given endpoint (e.g. a
 * handler retried after a partial failure) never double-enqueues delivery of the same
 * row.
 */
export async function dispatchWebhookEvent(
  db: Kysely<Database>,
  organizationId: string,
  eventType: string,
  payload: unknown,
): Promise<void> {
  const endpoints = await db
    .selectFrom("webhook_endpoints")
    .selectAll()
    .where("organization_id", "=", organizationId)
    .where("is_active", "=", true)
    .execute();

  for (const endpoint of endpoints) {
    if (!endpoint.subscribed_events.includes(eventType) && !endpoint.subscribed_events.includes("*")) continue;

    const deliveryKey = randomUUID();
    const delivery = await db
      .insertInto("webhook_deliveries")
      .values({
        webhook_endpoint_id: endpoint.id,
        event_type: eventType,
        payload: JSON.stringify(payload),
        delivery_key: deliveryKey,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await enqueueJob(db, {
      packageId: null,
      jobType: "WEBHOOK_DELIVERY",
      payload: { webhookDeliveryId: delivery.id },
      idempotencyKey: `webhook-delivery-${delivery.id}`,
    });
  }
}
