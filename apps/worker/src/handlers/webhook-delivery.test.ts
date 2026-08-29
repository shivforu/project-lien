import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "@project-lien/db";
import { runMigrations } from "@project-lien/db";
import { verifyWebhookSignature } from "@project-lien/shared-config";
import { createLogger } from "@project-lien/shared-config";
import { webhookDeliveryHandler } from "./webhook-delivery.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/project_lien_test";
let db: Kysely<Database>;
let server: Server;
let serverUrl: string;
const receivedBodies: { body: string; signature: string }[] = [];
const logger = createLogger("worker-test");

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(TEST_DATABASE_URL);
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_DATABASE_URL }) }) });

  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        receivedBodies.push({ body: raw, signature: String(req.headers["x-lien-signature"]) });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      serverUrl = `http://127.0.0.1:${port}/hook`;
      resolve();
    });
  });
});

afterAll(async () => {
  await db.destroy();
  await new Promise((resolve) => server.close(resolve));
});

describe("webhookDeliveryHandler", () => {
  it("POSTs a correctly HMAC-signed payload and marks the delivery DELIVERED", async () => {
    const org = await db.insertInto("organizations").values({ name: "Test Org", slug: "test-org" }).returning("id").executeTakeFirstOrThrow();
    const endpoint = await db
      .insertInto("webhook_endpoints")
      .values({ organization_id: org.id, url: serverUrl, secret: "endpoint-secret", subscribed_events: ["package.status_changed"] })
      .returning("id")
      .executeTakeFirstOrThrow();
    const delivery = await db
      .insertInto("webhook_deliveries")
      .values({ webhook_endpoint_id: endpoint.id, event_type: "package.status_changed", payload: JSON.stringify({ packageId: "p1" }), delivery_key: "dk-1" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await webhookDeliveryHandler({ webhookDeliveryId: delivery.id }, { db, logger });

    expect(receivedBodies.length).toBe(1);
    const received = receivedBodies[0]!;
    expect(verifyWebhookSignature("endpoint-secret", received.body, received.signature)).toBe(true);

    const row = await db.selectFrom("webhook_deliveries").selectAll().where("id", "=", delivery.id).executeTakeFirstOrThrow();
    expect(row.status).toBe("DELIVERED");
    expect(row.response_status_code).toBe(200);
    expect(row.attempts).toBe(1);
  });

  it("throws (for the queue to retry) when the endpoint is unreachable", async () => {
    const org = await db.insertInto("organizations").values({ name: "Test Org 2", slug: "test-org-2" }).returning("id").executeTakeFirstOrThrow();
    const endpoint = await db
      .insertInto("webhook_endpoints")
      .values({ organization_id: org.id, url: "http://127.0.0.1:1", secret: "s", subscribed_events: ["*"] })
      .returning("id")
      .executeTakeFirstOrThrow();
    const delivery = await db
      .insertInto("webhook_deliveries")
      .values({ webhook_endpoint_id: endpoint.id, event_type: "package.status_changed", payload: JSON.stringify({}), delivery_key: "dk-2" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await expect(webhookDeliveryHandler({ webhookDeliveryId: delivery.id }, { db, logger })).rejects.toThrow();

    const row = await db.selectFrom("webhook_deliveries").selectAll().where("id", "=", delivery.id).executeTakeFirstOrThrow();
    expect(row.status).toBe("FAILED");
  });
});
