import { signWebhookPayload } from "@project-lien/shared-config";
import type { JobHandler } from "./types.js";

export interface WebhookDeliveryPayload {
  webhookDeliveryId: string;
}

/**
 * Delivers one queued webhook (docs/REQUIREMENTS_MATRIX.md #22). A non-2xx response or a
 * network error throws, which lets the worker's existing retry/backoff/dead-letter
 * machinery (docs/DECISIONS.md D3) handle redelivery — there is no separate webhook-retry
 * scheduler.
 */
export const webhookDeliveryHandler: JobHandler = async (rawPayload, { db, logger }) => {
  const { webhookDeliveryId } = rawPayload as WebhookDeliveryPayload;

  const delivery = await db.selectFrom("webhook_deliveries").selectAll().where("id", "=", webhookDeliveryId).executeTakeFirst();
  if (!delivery) throw new Error(`webhook_delivery ${webhookDeliveryId} not found`);

  const endpoint = await db
    .selectFrom("webhook_endpoints")
    .selectAll()
    .where("id", "=", delivery.webhook_endpoint_id)
    .executeTakeFirstOrThrow();

  const body = JSON.stringify({ eventType: delivery.event_type, payload: delivery.payload, deliveryKey: delivery.delivery_key });
  const signature = signWebhookPayload(endpoint.secret, body);

  await db.updateTable("webhook_deliveries").set({ attempts: delivery.attempts + 1, last_attempt_at: new Date() }).where("id", "=", delivery.id).execute();

  let response: Response;
  try {
    response = await fetch(endpoint.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-lien-signature": signature },
      body,
    });
  } catch (err) {
    await db.updateTable("webhook_deliveries").set({ status: "FAILED" }).where("id", "=", delivery.id).execute();
    throw err;
  }

  await db
    .updateTable("webhook_deliveries")
    .set({ status: response.ok ? "DELIVERED" : "FAILED", response_status_code: response.status })
    .where("id", "=", delivery.id)
    .execute();

  if (!response.ok) {
    throw new Error(`Webhook endpoint ${endpoint.url} responded with status ${response.status}`);
  }

  logger.info({ webhookDeliveryId, url: endpoint.url, status: response.status }, "webhook delivered");
};
