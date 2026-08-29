import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "@project-lien/db";
import { runMigrations } from "@project-lien/db";
import { claimNextJob, completeJob, enqueueJob } from "@project-lien/domain-workflow";
import { erecordingRouter } from "../vendor-router.js";
import { JOB_HANDLERS } from "../job-dispatcher.js";
import { createLogger } from "@project-lien/shared-config";

// Integration test against a real Postgres, proving the worker's queue mechanics and the
// POLL_VENDOR_SUBMISSION handler wire together end to end: enqueue -> claim -> handler ->
// package state transition (docs/TEST_STRATEGY.md scenario A/D).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/project_lien_test";

let db: Kysely<Database>;
const logger = createLogger("worker-test");

async function runNextJob(): Promise<void> {
  const job = await claimNextJob(db, "test-worker");
  if (!job) throw new Error("expected a queued job but found none");
  const handler = JOB_HANDLERS[job.job_type];
  if (!handler) throw new Error(`no handler for ${job.job_type}`);
  await handler(job.payload, { db, logger });
  await completeJob(db, job.id);
}

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(TEST_DATABASE_URL);
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_DATABASE_URL }) }) });

  await db.insertInto("state_jurisdiction_rules").values({
    state_code: "CA",
    state_name: "California",
    theory_type: "TITLE_THEORY",
    default_doc_type: "DEED_OF_RECONVEYANCE",
    statutory_deadline_days: 30,
  }).execute();
  await db.insertInto("county_jurisdiction_rules").values({
    county_fips: "06037",
    state_code: "CA",
    county_name: "Los Angeles",
    e_recording_network: "SIMPLIFILE",
  }).execute();
});

afterAll(async () => {
  await db.destroy();
});

describe("POLL_VENDOR_SUBMISSION end to end", () => {
  it("progresses a package from SUBMITTED -> COUNTY_PROCESSING -> RECORDED across successive polls", async () => {
    const org = await db.insertInto("organizations").values({ name: "Test Org", slug: "test-org" }).returning("id").executeTakeFirstOrThrow();
    const property = await db
      .insertInto("properties")
      .values({
        organization_id: org.id,
        parcel_number: "123",
        address_line1: "1 Main St",
        city: "Los Angeles",
        state_code: "CA",
        zip_code: "90001",
        county_fips: "06037",
        county_name: "Los Angeles",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const loan = await db
      .insertInto("loans")
      .values({
        organization_id: org.id,
        loan_number: "LN-1",
        property_id: property.id,
        unpaid_principal_cents: 0,
        interest_rate_bps: 0,
        borrower_name: "Jane Borrower",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const pkg = await db
      .insertInto("recording_packages")
      .values({
        organization_id: org.id,
        package_identifier: "PKG-TEST-1",
        loan_id: loan.id,
        property_id: property.id,
        state_code: "CA",
        county_fips: "06037",
        status: "SUBMITTED",
        document_type: "DEED_OF_RECONVEYANCE",
        statutory_deadline: new Date("2026-12-31"),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // Seed real mock-adapter state via the SAME router singleton the handler uses.
    const submitResult = await erecordingRouter.resolve("SIMPLIFILE").submit({
      packageId: pkg.id,
      network: "SIMPLIFILE",
      priaXml: "<PriaEDocPackage/>",
      documentPdfBase64: "x",
      idempotencyKey: `submit-${pkg.id}`,
    });

    const submission = await db
      .insertInto("vendor_submissions")
      .values({
        package_id: pkg.id,
        network: "SIMPLIFILE",
        vendor_tracking_id: submitResult.vendorTrackingId,
        status: "SUBMITTED",
        submitted_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await enqueueJob(db, { packageId: pkg.id, jobType: "POLL_VENDOR_SUBMISSION", payload: { vendorSubmissionId: submission.id } });

    // Poll 1: mock adapter reports SUBMITTED -> handler re-enqueues itself, no transition yet.
    await runNextJob();
    let current = await db.selectFrom("recording_packages").selectAll().where("id", "=", pkg.id).executeTakeFirstOrThrow();
    expect(current.status).toBe("SUBMITTED");

    // Poll 2: mock adapter reports ACCEPTED -> package moves to COUNTY_PROCESSING.
    await db.updateTable("workflow_jobs").set({ available_at: new Date() }).execute();
    await runNextJob();
    current = await db.selectFrom("recording_packages").selectAll().where("id", "=", pkg.id).executeTakeFirstOrThrow();
    expect(current.status).toBe("COUNTY_PROCESSING");

    // Poll 3: mock adapter reports RECORDED -> package moves to RECORDED with instrument number.
    await enqueueJob(db, { packageId: pkg.id, jobType: "POLL_VENDOR_SUBMISSION", payload: { vendorSubmissionId: submission.id } });
    await runNextJob();
    current = await db.selectFrom("recording_packages").selectAll().where("id", "=", pkg.id).executeTakeFirstOrThrow();
    expect(current.status).toBe("RECORDED");
    expect(current.recorded_instrument_number).toBeTruthy();

    const events = await db.selectFrom("workflow_events").selectAll().where("package_id", "=", pkg.id).execute();
    expect(events.map((e) => e.to_status)).toEqual(["COUNTY_PROCESSING", "RECORDED"]);
  });
});
