import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "@project-lien/db";
import { runMigrations } from "@project-lien/db";
import { claimNextJob, completeJob, enqueueJob, failJob, requeueStaleJobs } from "./job-queue.js";

// Integration test against a real Postgres — the whole point of this suite is proving the
// `FOR UPDATE SKIP LOCKED` claim pattern is actually exclusive under real concurrent
// access, which a mock/in-memory DB cannot demonstrate (docs/TEST_STRATEGY.md).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/project_lien_test";

let db: Kysely<Database>;

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(TEST_DATABASE_URL);
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_DATABASE_URL }) }) });
});

afterAll(async () => {
  await db.destroy();
});

// Each test gets a clean workflow_jobs table — without this, a job left QUEUED by one
// test (e.g. the idempotency test's never-claimed duplicate) would still be sitting in
// the table during a later test, which would silently invalidate assertions that depend
// on there being exactly one queued row (as the concurrency test below does).
beforeEach(async () => {
  await db.deleteFrom("workflow_jobs").execute();
});

describe("job queue", () => {
  it("enqueues and claims a job, then completes it", async () => {
    const jobId = await enqueueJob(db, { packageId: null, jobType: "TEST_JOB", payload: { hello: "world" } });
    expect(jobId).not.toBeNull();

    const claimed = await claimNextJob(db, "worker-1");
    expect(claimed?.id).toBe(jobId);
    expect(claimed?.status).toBe("IN_PROGRESS");
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.payload).toEqual({ hello: "world" });

    await completeJob(db, claimed!.id);
    const remaining = await claimNextJob(db, "worker-1");
    expect(remaining).toBeNull();
  });

  it("is idempotent on enqueue when idempotencyKey collides", async () => {
    const first = await enqueueJob(db, { packageId: null, jobType: "TEST_JOB", payload: {}, idempotencyKey: "dup-key-1" });
    const second = await enqueueJob(db, { packageId: null, jobType: "TEST_JOB", payload: {}, idempotencyKey: "dup-key-1" });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("never lets two concurrent claimers get the same job (FOR UPDATE SKIP LOCKED)", async () => {
    await enqueueJob(db, { packageId: null, jobType: "TEST_JOB", payload: {} });

    const [a, b] = await Promise.all([claimNextJob(db, "worker-a"), claimNextJob(db, "worker-b")]);
    const claimedIds = [a, b].filter((x) => x !== null).map((x) => x!.id);
    // Exactly one of the two concurrent claimers should have won this single queued job.
    expect(claimedIds.length).toBe(1);
  });

  it("requeues with backoff on failure, then dead-letters after max attempts", async () => {
    const jobId = await enqueueJob(db, { packageId: null, jobType: "TEST_JOB", payload: {}, maxAttempts: 2 });
    const claim1 = await claimNextJob(db, "worker-1");
    expect(claim1?.id).toBe(jobId);
    const afterFirstFailure = await failJob(db, claim1!, "simulated error 1");
    expect(afterFirstFailure).toBe("QUEUED");

    // available_at is now in the future (backoff) — force it to now so the test doesn't sleep.
    await db.updateTable("workflow_jobs").set({ available_at: new Date() }).where("id", "=", jobId!).execute();

    const claim2 = await claimNextJob(db, "worker-1");
    expect(claim2?.attempts).toBe(2);
    const afterSecondFailure = await failJob(db, claim2!, "simulated error 2");
    expect(afterSecondFailure).toBe("DEAD_LETTER");

    const deadLetter = await db.selectFrom("workflow_jobs").selectAll().where("id", "=", jobId!).executeTakeFirst();
    expect(deadLetter?.status).toBe("DEAD_LETTER");
    expect(deadLetter?.last_error).toBe("simulated error 2");
  });

  it("requeues stale IN_PROGRESS jobs (restart-recovery, scenario J)", async () => {
    const jobId = await enqueueJob(db, { packageId: null, jobType: "TEST_JOB", payload: {} });
    const claimed = await claimNextJob(db, "worker-crashed");
    expect(claimed?.id).toBe(jobId);

    // Simulate the claim happening long enough ago to be considered stale.
    await db
      .updateTable("workflow_jobs")
      .set({ locked_at: new Date(Date.now() - 60_000) })
      .where("id", "=", jobId!)
      .execute();

    const requeuedCount = await requeueStaleJobs(db, 30_000);
    expect(requeuedCount).toBeGreaterThanOrEqual(1);

    const row = await db.selectFrom("workflow_jobs").selectAll().where("id", "=", jobId!).executeTakeFirst();
    expect(row?.status).toBe("QUEUED");
    expect(row?.locked_by).toBeNull();
  });
});
