import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "@project-lien/db";
import { runMigrations } from "@project-lien/db";
import { createLogger } from "@project-lien/shared-config";
import { statutoryDeadlineScanHandler } from "./statutory-deadline-scan.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/project_lien_test";
let db: Kysely<Database>;
const logger = createLogger("worker-test");

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(TEST_DATABASE_URL);
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_DATABASE_URL }) }) });

  await db.insertInto("state_jurisdiction_rules").values({
    state_code: "NY", state_name: "New York", theory_type: "LIEN_THEORY", default_doc_type: "SATISFACTION_OF_MORTGAGE",
    statutory_deadline_days: 30, daily_penalty_cents: 150000,
  }).execute();
  await db.insertInto("county_jurisdiction_rules").values({ county_fips: "36047", state_code: "NY", county_name: "Kings" }).execute();

  const org = await db.insertInto("organizations").values({ name: "Test Org", slug: "test-org" }).returning("id").executeTakeFirstOrThrow();
  await db
    .insertInto("webhook_endpoints")
    .values({ organization_id: org.id, url: "https://example.test/hook", secret: "s", subscribed_events: ["deadline.at_risk"] })
    .execute();
  const property = await db
    .insertInto("properties")
    .values({ organization_id: org.id, parcel_number: "1", address_line1: "1 Main St", city: "Brooklyn", state_code: "NY", zip_code: "11201", county_fips: "36047", county_name: "Kings" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const loan = await db
    .insertInto("loans")
    .values({ organization_id: org.id, loan_number: "LN-1", property_id: property.id, unpaid_principal_cents: 0, interest_rate_bps: 0, borrower_name: "Jane Borrower" })
    .returning("id")
    .executeTakeFirstOrThrow();

  // One package well past its statutory deadline, one comfortably on track.
  await db.insertInto("recording_packages").values({
    organization_id: org.id, package_identifier: "PKG-PAST-DUE", loan_id: loan.id, property_id: property.id,
    state_code: "NY", county_fips: "36047", status: "PENDING_SIGNATURE", document_type: "SATISFACTION_OF_MORTGAGE",
    statutory_deadline: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  }).execute();
  await db.insertInto("recording_packages").values({
    organization_id: org.id, package_identifier: "PKG-ON-TRACK", loan_id: loan.id, property_id: property.id,
    state_code: "NY", county_fips: "36047", status: "DRAFT", document_type: "SATISFACTION_OF_MORTGAGE",
    statutory_deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  }).execute();
});

afterAll(async () => {
  await db.destroy();
});

describe("statutoryDeadlineScanHandler", () => {
  it("logs a workflow_event and fires deadline.at_risk only for the at-risk package, and reschedules itself", async () => {
    await statutoryDeadlineScanHandler({}, { db, logger });

    const events = await db.selectFrom("workflow_events").selectAll().execute();
    expect(events.length).toBe(1);
    expect(events[0]?.reason).toContain("PAST_DEADLINE");

    const deliveries = await db.selectFrom("webhook_deliveries").selectAll().where("event_type", "=", "deadline.at_risk").execute();
    expect(deliveries.length).toBe(1);

    const rescheduled = await db.selectFrom("workflow_jobs").selectAll().where("job_type", "=", "STATUTORY_DEADLINE_SCAN").execute();
    expect(rescheduled.length).toBe(1);
    expect(rescheduled[0]?.status).toBe("QUEUED");
  });

  it("does not re-fire the workflow_event or webhook on a second tick at the same risk level (scenario G)", async () => {
    await statutoryDeadlineScanHandler({}, { db, logger });

    const events = await db.selectFrom("workflow_events").selectAll().execute();
    expect(events.length).toBe(1); // still just the one from the first tick — no duplicate

    const deliveries = await db.selectFrom("webhook_deliveries").selectAll().where("event_type", "=", "deadline.at_risk").execute();
    expect(deliveries.length).toBe(1); // still just the one — not re-sent every tick
  });
});
