import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "@project-lien/db";
import { runMigrations } from "@project-lien/db";
import { claimNextJob, completeJob, failJob } from "@project-lien/domain-workflow";
import { MockErecordingAdapter } from "@project-lien/adapters-erecording";
import { createLogger } from "@project-lien/shared-config";
import { createApp } from "@project-lien/api/dist/app.js";
import { hashPassword } from "@project-lien/api/dist/auth/password.js";
import { erecordingRouter } from "./vendor-router.js";
import { JOB_HANDLERS } from "./job-dispatcher.js";

/**
 * The 10 named E2E scenarios from docs/TEST_STRATEGY.md, driven against a real Postgres,
 * the real compiled Express app (via supertest — no bound port), and the real job-queue
 * handlers (claimed/dispatched/completed-or-failed exactly the way apps/worker's own main
 * loop does it, see `runNextJob` below vs. `processOneJob` in `src/index.ts`).
 *
 * This is also where Phase 3's document/pre-flight engine, Phase 4's PRIA serializer, and
 * Phase 5's vendor adapters get wired into the actual package lifecycle for the first
 * time (`POST /releases/:id/preflight` and `/submit`, `SUBMIT_PACKAGE` and
 * `RECONCILE_FEE` jobs — all new in Phase 12) — earlier phases only unit-tested each
 * engine in isolation. See docs/DECISIONS.md D17 for the simplifications that surfaced
 * doing this for real: pre-flight here is structural-only (no signature/notary yet, since
 * no real capture feature exists for either), and escrow auto-funds from the loan's
 * unpaid principal since there's no dedicated "payoff received" trigger yet.
 *
 * Scenario E (duplicate inbound vendor/county webhook) is NOT exercised here: this build
 * only has an OUTBOUND webhook dispatcher (docs/REQUIREMENTS_MATRIX.md #22 is marked
 * IN_PROGRESS for exactly this reason) — there is no inbound webhook receiver endpoint to
 * send a duplicate payload to. Writing a test against different code and calling it
 * scenario E would misrepresent what's covered, so it's left explicitly not-done here and
 * tracked in PROGRESS.md/REQUIREMENTS_MATRIX.md instead.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/project_lien_test";

let db: Kysely<Database>;
let app: Express;
const logger = createLogger("e2e-test");

/** Mirrors apps/worker/src/index.ts's `processOneJob` (claim -> dispatch -> complete/fail)
 * exactly, so job-failure/backoff/dead-letter behavior in these tests matches production,
 * not a simplified test-only stand-in. */
async function runNextJob(): Promise<"completed" | "failed" | "none"> {
  const job = await claimNextJob(db, "e2e-test-worker");
  if (!job) return "none";
  const handler = JOB_HANDLERS[job.job_type];
  if (!handler) throw new Error(`no handler for ${job.job_type}`);
  try {
    await handler(job.payload, { db, logger });
    await completeJob(db, job.id);
    return "completed";
  } catch (err) {
    await failJob(db, job, err instanceof Error ? err.message : String(err));
    return "failed";
  }
}

/** Bypasses the 30s poll re-delay / backoff wait so tests run instantly. */
async function makeAllQueuedJobsAvailableNow(): Promise<void> {
  await db.updateTable("workflow_jobs").set({ available_at: new Date() }).where("status", "=", "QUEUED").execute();
}

interface TestOrg {
  orgId: string;
  token: string;
}

async function createOrgWithAdmin(slug: string): Promise<TestOrg> {
  const org = await db.insertInto("organizations").values({ name: slug, slug }).returning("id").executeTakeFirstOrThrow();
  const passwordHash = await hashPassword("correct horse battery staple");
  const user = await db
    .insertInto("users")
    .values({ email: `${slug}@example.com`, password_hash: passwordHash, full_name: "E2E Admin" })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("org_memberships").values({ organization_id: org.id, user_id: user.id, role: "ORG_ADMIN" }).execute();
  const login = await request(app).post("/api/v1/auth/login").send({ email: `${slug}@example.com`, password: "correct horse battery staple" });
  return { orgId: org.id, token: login.body.accessToken };
}

async function seedJurisdiction(stateCode: string, countyFips: string, opts: { trusteeRequired: boolean }): Promise<void> {
  await db
    .insertInto("state_jurisdiction_rules")
    .values({
      state_code: stateCode,
      state_name: `Test State ${stateCode}`,
      theory_type: "LIEN_THEORY",
      default_doc_type: "SATISFACTION_OF_MORTGAGE",
      statutory_deadline_days: 30,
      trustee_required: opts.trusteeRequired,
    })
    .execute();
  await db
    .insertInto("county_jurisdiction_rules")
    .values({
      county_fips: countyFips,
      state_code: stateCode,
      county_name: `Test County ${countyFips}`,
      base_recording_fee_cents: 5000,
      per_page_fee_cents: 200,
      e_recording_network: "SIMPLIFILE",
    })
    .execute();
}

async function createLoanAndProperty(orgId: string, stateCode: string, countyFips: string) {
  const property = await db
    .insertInto("properties")
    .values({
      organization_id: orgId,
      parcel_number: "1",
      address_line1: "1 Main St",
      city: "Testville",
      state_code: stateCode,
      zip_code: "00001",
      county_fips: countyFips,
      county_name: `Test County ${countyFips}`,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const loan = await db
    .insertInto("loans")
    .values({ organization_id: orgId, loan_number: `LN-${property.id.slice(0, 8)}`, property_id: property.id, unpaid_principal_cents: 500_000, interest_rate_bps: 500, borrower_name: "Jane Borrower" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { propertyId: property.id, loanId: loan.id };
}

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(TEST_DATABASE_URL);
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_DATABASE_URL }) }) });
  app = createApp();

  await seedJurisdiction("EZ", "00001", { trusteeRequired: false });
  await seedJurisdiction("TR", "00002", { trusteeRequired: true });
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(() => {
  // Reset the shared SIMPLIFILE mock adapter to plain default behavior before every test
  // — several scenarios below register a custom-configured instance to force a specific
  // vendor outcome, and must not leak into unrelated tests.
  erecordingRouter.register("SIMPLIFILE", new MockErecordingAdapter("SIMPLIFILE"));
});

async function createPackage(token: string, orgId: string, identifier: string, stateCode: string, countyFips: string): Promise<string> {
  const { loanId, propertyId } = await createLoanAndProperty(orgId, stateCode, countyFips);
  const res = await request(app)
    .post("/api/v1/releases")
    .set("Authorization", `Bearer ${token}`)
    .send({ packageIdentifier: identifier, loanId, propertyId, stateCode, countyFips });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

/** Human-gated steps (signature capture, notary) have no real integration in this build
 * yet (docs/DECISIONS.md D17) — test setup advances status directly past them, matching
 * what production code actually does today (nothing), rather than fabricating a fake
 * capture flow. */
async function advanceToReadyToSubmit(packageId: string): Promise<void> {
  for (const to of ["PENDING_SIGNATURE", "PENDING_NOTARY", "READY_TO_SUBMIT"] as const) {
    await db.updateTable("recording_packages").set({ status: to, updated_at: new Date() }).where("id", "=", packageId).execute();
  }
}

async function runFullSubmissionToCompletion(packageId: string): Promise<void> {
  expect(await runNextJob()).toBe("completed"); // SUBMIT_PACKAGE
  await makeAllQueuedJobsAvailableNow();
  expect(await runNextJob()).toBe("completed"); // poll #1: SUBMITTED
  await makeAllQueuedJobsAvailableNow();
  expect(await runNextJob()).toBe("completed"); // poll #2: ACCEPTED -> COUNTY_PROCESSING
  await makeAllQueuedJobsAvailableNow();
  expect(await runNextJob()).toBe("completed"); // poll #3: RECORDED -> RECORDED, enqueues RECONCILE_FEE
  await makeAllQueuedJobsAvailableNow();
  expect(await runNextJob()).toBe("completed"); // RECONCILE_FEE -> COMPLETE
}

describe("Scenario A: successful recording", () => {
  it("goes DRAFT -> ... -> COMPLETE with a balanced fee reconciliation", async () => {
    const { orgId, token } = await createOrgWithAdmin("scenario-a");
    const packageId = await createPackage(token, orgId, "PKG-A", "EZ", "00001");

    const preflight = await request(app).post(`/api/v1/releases/${packageId}/preflight`).set("Authorization", `Bearer ${token}`);
    expect(preflight.status).toBe(200);
    expect(preflight.body.data.status).toBe("READY");
    expect(preflight.body.preflight.passed).toBe(true);

    await advanceToReadyToSubmit(packageId);

    const submit = await request(app).post(`/api/v1/releases/${packageId}/submit`).set("Authorization", `Bearer ${token}`);
    expect(submit.status).toBe(202);

    await runFullSubmissionToCompletion(packageId);

    const final = await db.selectFrom("recording_packages").selectAll().where("id", "=", packageId).executeTakeFirstOrThrow();
    expect(final.status).toBe("COMPLETE");
    expect(final.completed_at).not.toBeNull();
    expect(final.recording_fee_charged_cents).toBe(5000 + 200); // base + 1 page, no variance

    const reconciliations = await db.selectFrom("fee_reconciliations").selectAll().where("package_id", "=", packageId).execute();
    expect(reconciliations).toHaveLength(1);
    expect(reconciliations[0]?.status).toBe("BALANCED");
  });
});

describe("Scenario B: pre-flight rejection", () => {
  it("fails structural pre-flight when the jurisdiction requires a trustee and none is set, without ever calling a vendor", async () => {
    const { orgId, token } = await createOrgWithAdmin("scenario-b");
    const packageId = await createPackage(token, orgId, "PKG-B", "TR", "00002");

    const preflight = await request(app).post(`/api/v1/releases/${packageId}/preflight`).set("Authorization", `Bearer ${token}`);
    expect(preflight.status).toBe(200);
    expect(preflight.body.data.status).toBe("PREFLIGHT_FAILED");
    expect(preflight.body.preflight.passed).toBe(false);
    expect(preflight.body.preflight.findings.some((f: { code: string }) => f.code === "TRUSTEE_MISSING")).toBe(true);

    const submissions = await db.selectFrom("vendor_submissions").selectAll().where("package_id", "=", packageId).execute();
    expect(submissions).toHaveLength(0); // no vendor call was ever made
  });
});

describe("Scenario C: county rejection + resubmission", () => {
  it("rejects during polling, moves through the exception center, and RECORDs on resubmission", async () => {
    const { orgId, token } = await createOrgWithAdmin("scenario-c");
    const packageId = await createPackage(token, orgId, "PKG-C", "EZ", "00001");

    erecordingRouter.register("SIMPLIFILE", new MockErecordingAdapter("SIMPLIFILE", { rejectOnPollCount: 2 }));

    await request(app).post(`/api/v1/releases/${packageId}/preflight`).set("Authorization", `Bearer ${token}`);
    await advanceToReadyToSubmit(packageId);
    await request(app).post(`/api/v1/releases/${packageId}/submit`).set("Authorization", `Bearer ${token}`);

    expect(await runNextJob()).toBe("completed"); // SUBMIT_PACKAGE -> SUBMITTED
    await makeAllQueuedJobsAvailableNow();
    expect(await runNextJob()).toBe("completed"); // poll #1: still SUBMITTED
    await makeAllQueuedJobsAvailableNow();
    expect(await runNextJob()).toBe("completed"); // poll #2: REJECTED (configured above)

    let current = await db.selectFrom("recording_packages").selectAll().where("id", "=", packageId).executeTakeFirstOrThrow();
    expect(current.status).toBe("REJECTED");

    const exceptions = await request(app).get("/api/v1/exceptions").set("Authorization", `Bearer ${token}`);
    expect(exceptions.body.data.packageExceptions.some((p: { id: string }) => p.id === packageId)).toBe(true);

    const resolve = await request(app).post(`/api/v1/exceptions/${packageId}/resolve`).set("Authorization", `Bearer ${token}`);
    expect(resolve.status).toBe(200);
    expect(resolve.body.data.status).toBe("RESUBMISSION_REQUIRED");

    const resubmit = await request(app).post(`/api/v1/releases/${packageId}/resubmit`).set("Authorization", `Bearer ${token}`);
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.data.status).toBe("VALIDATING");

    // A real county rejection this time is behind us — swap back to a well-behaved
    // adapter so the resubmission can actually succeed.
    erecordingRouter.register("SIMPLIFILE", new MockErecordingAdapter("SIMPLIFILE"));

    const preflight2 = await request(app).post(`/api/v1/releases/${packageId}/preflight`).set("Authorization", `Bearer ${token}`);
    expect(preflight2.body.data.status).toBe("READY");

    await advanceToReadyToSubmit(packageId);
    await request(app).post(`/api/v1/releases/${packageId}/submit`).set("Authorization", `Bearer ${token}`);
    await runFullSubmissionToCompletion(packageId);

    current = await db.selectFrom("recording_packages").selectAll().where("id", "=", packageId).executeTakeFirstOrThrow();
    expect(current.status).toBe("COMPLETE");
  });
});

describe("Scenario D: vendor outage / retry", () => {
  it("retries with backoff after a simulated vendor outage and eventually succeeds", async () => {
    const { orgId, token } = await createOrgWithAdmin("scenario-d");
    const packageId = await createPackage(token, orgId, "PKG-D", "EZ", "00001");

    erecordingRouter.register("SIMPLIFILE", new MockErecordingAdapter("SIMPLIFILE", { throwOnPollCount: 1 }));

    await request(app).post(`/api/v1/releases/${packageId}/preflight`).set("Authorization", `Bearer ${token}`);
    await advanceToReadyToSubmit(packageId);
    await request(app).post(`/api/v1/releases/${packageId}/submit`).set("Authorization", `Bearer ${token}`);

    expect(await runNextJob()).toBe("completed"); // SUBMIT_PACKAGE -> SUBMITTED, enqueues poll
    await makeAllQueuedJobsAvailableNow();

    // Scoped by package_id, not just job_type: this test file shares one Postgres schema
    // across every scenario in the describe blocks below, so an unscoped "first matching
    // job_type" query could return a different scenario's already-completed poll job
    // instead of this package's own.
    const pollJobBefore = await db
      .selectFrom("workflow_jobs")
      .selectAll()
      .where("job_type", "=", "POLL_VENDOR_SUBMISSION")
      .where("package_id", "=", packageId)
      .orderBy("created_at", "desc")
      .executeTakeFirstOrThrow();
    expect(await runNextJob()).toBe("failed"); // poll #1 throws (simulated outage)

    const pollJobAfter = await db.selectFrom("workflow_jobs").selectAll().where("id", "=", pollJobBefore.id).executeTakeFirstOrThrow();
    expect(pollJobAfter.status).toBe("QUEUED"); // requeued with backoff, not dead-lettered
    expect(pollJobAfter.attempts).toBe(1);
    expect(pollJobAfter.last_error).toContain("Simulated vendor outage");

    // Bypass the real backoff delay so the retry runs immediately in this test.
    await makeAllQueuedJobsAvailableNow();
    expect(await runNextJob()).toBe("completed"); // poll #1 retried -> this time pollCount=2 -> ACCEPTED

    let current = await db.selectFrom("recording_packages").selectAll().where("id", "=", packageId).executeTakeFirstOrThrow();
    expect(current.status).toBe("COUNTY_PROCESSING");

    await makeAllQueuedJobsAvailableNow();
    expect(await runNextJob()).toBe("completed"); // poll #2 -> RECORDED
    await makeAllQueuedJobsAvailableNow();
    expect(await runNextJob()).toBe("completed"); // RECONCILE_FEE -> COMPLETE

    current = await db.selectFrom("recording_packages").selectAll().where("id", "=", packageId).executeTakeFirstOrThrow();
    expect(current.status).toBe("COMPLETE");
  });
});

describe("Scenario F: duplicate submission attempt", () => {
  it("POSTing /submit twice only ever enqueues (and runs) one SUBMIT_PACKAGE job", async () => {
    const { orgId, token } = await createOrgWithAdmin("scenario-f");
    const packageId = await createPackage(token, orgId, "PKG-F", "EZ", "00001");

    await request(app).post(`/api/v1/releases/${packageId}/preflight`).set("Authorization", `Bearer ${token}`);
    await advanceToReadyToSubmit(packageId);

    const first = await request(app).post(`/api/v1/releases/${packageId}/submit`).set("Authorization", `Bearer ${token}`);
    const second = await request(app).post(`/api/v1/releases/${packageId}/submit`).set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.body.data.jobId).toBeTruthy();
    expect(second.body.data.jobId).toBeNull(); // idempotency key collision — no second job created

    const jobs = await db.selectFrom("workflow_jobs").selectAll().where("job_type", "=", "SUBMIT_PACKAGE").where("package_id", "=", packageId).execute();
    expect(jobs).toHaveLength(1);

    await runFullSubmissionToCompletion(packageId);
    const submissions = await db.selectFrom("vendor_submissions").selectAll().where("package_id", "=", packageId).execute();
    expect(submissions).toHaveLength(1); // only ever submitted to the vendor once
  });
});

describe("Scenario H: fee overage / refund", () => {
  it("refunds the difference back into escrow balance when the county charges less than estimated", async () => {
    const { orgId, token } = await createOrgWithAdmin("scenario-h");
    const packageId = await createPackage(token, orgId, "PKG-H", "EZ", "00001");

    erecordingRouter.register("SIMPLIFILE", new MockErecordingAdapter("SIMPLIFILE", { feeVarianceCents: -300 })); // county charges 300c less

    await request(app).post(`/api/v1/releases/${packageId}/preflight`).set("Authorization", `Bearer ${token}`);
    await advanceToReadyToSubmit(packageId);
    await request(app).post(`/api/v1/releases/${packageId}/submit`).set("Authorization", `Bearer ${token}`);
    await runFullSubmissionToCompletion(packageId);

    const reconciliation = await db.selectFrom("fee_reconciliations").selectAll().where("package_id", "=", packageId).executeTakeFirstOrThrow();
    expect(reconciliation.status).toBe("REFUND_QUEUED");
    expect(reconciliation.refund_amount_cents).toBe(300);

    const ledgerRows = await db.selectFrom("ledger_transactions").selectAll().where("reference_package_id", "=", packageId).execute();
    expect(ledgerRows.some((r) => r.type === "ESCROW_REFUND_ISSUED")).toBe(true);
  });
});

describe("Scenario I: fee shortage", () => {
  it("covers the shortfall from escrow balance when the county charges more than estimated, and still completes", async () => {
    const { orgId, token } = await createOrgWithAdmin("scenario-i");
    const packageId = await createPackage(token, orgId, "PKG-I", "EZ", "00001");

    erecordingRouter.register("SIMPLIFILE", new MockErecordingAdapter("SIMPLIFILE", { feeVarianceCents: 400 })); // county charges 400c more

    await request(app).post(`/api/v1/releases/${packageId}/preflight`).set("Authorization", `Bearer ${token}`);
    await advanceToReadyToSubmit(packageId);
    await request(app).post(`/api/v1/releases/${packageId}/submit`).set("Authorization", `Bearer ${token}`);
    await runFullSubmissionToCompletion(packageId);

    const final = await db.selectFrom("recording_packages").selectAll().where("id", "=", packageId).executeTakeFirstOrThrow();
    expect(final.status).toBe("COMPLETE"); // shortage does not block completion

    const reconciliation = await db.selectFrom("fee_reconciliations").selectAll().where("package_id", "=", packageId).executeTakeFirstOrThrow();
    expect(reconciliation.status).toBe("DEFICIT_COVERED");
    expect(reconciliation.variance_cents).toBe(400);

    const ledgerRows = await db.selectFrom("ledger_transactions").selectAll().where("reference_package_id", "=", packageId).execute();
    expect(ledgerRows.some((r) => r.type === "DEFICIT_COVERED")).toBe(true);
  });
});

describe("Scenario J: restart mid-workflow", () => {
  it("a job left IN_PROGRESS past its claim timeout is reclaimed and completed exactly once", async () => {
    const { orgId, token } = await createOrgWithAdmin("scenario-j");
    const packageId = await createPackage(token, orgId, "PKG-J", "EZ", "00001");

    await request(app).post(`/api/v1/releases/${packageId}/preflight`).set("Authorization", `Bearer ${token}`);
    await advanceToReadyToSubmit(packageId);
    await request(app).post(`/api/v1/releases/${packageId}/submit`).set("Authorization", `Bearer ${token}`);

    // Simulate a worker crash: claim the SUBMIT_PACKAGE job (marks it IN_PROGRESS,
    // locked_at = now) but never call the handler or completeJob/failJob — exactly what a
    // killed process leaves behind.
    const crashed = await claimNextJob(db, "crashed-worker");
    expect(crashed).not.toBeNull();
    expect(crashed?.status).toBe("IN_PROGRESS");
    // Backdate locked_at past any reasonable claim timeout, standing in for real elapsed
    // time (docs/REQUIREMENTS_MATRIX.md #21's job-queue.test.ts already covers
    // requeueStaleJobs's own logic directly against real elapsed time — this test's job is
    // to prove the *package* actually still reaches COMPLETE after a restart, end to end).
    await db.updateTable("workflow_jobs").set({ locked_at: new Date(Date.now() - 10 * 60 * 1000) }).where("id", "=", crashed!.id).execute();

    const { requeueStaleJobs } = await import("@project-lien/domain-workflow");
    const requeuedCount = await requeueStaleJobs(db, 60_000); // 60s claim timeout, well under the 10-minute backdate
    expect(requeuedCount).toBe(1);

    await runFullSubmissionToCompletion(packageId);

    const final = await db.selectFrom("recording_packages").selectAll().where("id", "=", packageId).executeTakeFirstOrThrow();
    expect(final.status).toBe("COMPLETE");

    const submissions = await db.selectFrom("vendor_submissions").selectAll().where("package_id", "=", packageId).execute();
    expect(submissions).toHaveLength(1); // exactly once, not duplicated by the reclaim
  });
});
