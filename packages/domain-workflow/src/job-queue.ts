import { sql, type Kysely } from "kysely";
import type { Database, JobStatus } from "@project-lien/db";
import { calculateBackoffMs } from "./backoff.js";

export interface EnqueueJobInput {
  packageId: string | null;
  jobType: string;
  payload: unknown;
  idempotencyKey?: string | null;
  maxAttempts?: number;
  availableAt?: Date;
}

export interface WorkflowJobRow {
  id: string;
  package_id: string | null;
  job_type: string;
  status: JobStatus;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  available_at: Date;
  locked_at: Date | null;
  locked_by: string | null;
  idempotency_key: string | null;
  last_error: string | null;
}

/**
 * Enqueues a job. When `idempotencyKey` is provided and a job with that key already
 * exists, this is a no-op (`ON CONFLICT DO NOTHING`) and returns null — the caller (e.g. a
 * webhook handler or an API request retried by a client) should treat that as "already
 * queued", not an error (docs/REQUIREMENTS_MATRIX.md #21).
 */
export async function enqueueJob(db: Kysely<Database>, input: EnqueueJobInput): Promise<string | null> {
  const result = await db
    .insertInto("workflow_jobs")
    .values({
      package_id: input.packageId,
      job_type: input.jobType,
      payload: JSON.stringify(input.payload),
      idempotency_key: input.idempotencyKey ?? null,
      max_attempts: input.maxAttempts ?? 5,
      available_at: input.availableAt ?? new Date(),
    })
    .onConflict((oc) => oc.column("idempotency_key").doNothing())
    .returning("id")
    .executeTakeFirst();
  return result?.id ?? null;
}

/**
 * Atomically claims the next available job using `SELECT ... FOR UPDATE SKIP LOCKED`
 * (docs/REQUIREMENTS_MATRIX.md #21) — the pattern that lets multiple worker processes
 * poll the same table concurrently without claiming the same row twice or blocking on
 * each other's row locks. Verified under real concurrent claims in job-queue.test.ts.
 */
export async function claimNextJob(db: Kysely<Database>, workerId: string): Promise<WorkflowJobRow | null> {
  const result = await sql<WorkflowJobRow>`
    UPDATE workflow_jobs
    SET status = 'IN_PROGRESS', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1, updated_at = now()
    WHERE id = (
      SELECT id FROM workflow_jobs
      WHERE status = 'QUEUED' AND available_at <= now()
      ORDER BY available_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `.execute(db);
  return result.rows[0] ?? null;
}

export async function completeJob(db: Kysely<Database>, jobId: string): Promise<void> {
  await db
    .updateTable("workflow_jobs")
    .set({ status: "SUCCEEDED", updated_at: new Date(), locked_at: null, locked_by: null })
    .where("id", "=", jobId)
    .execute();
}

/**
 * Fails a job. If attempts remain (< max_attempts), requeues it with exponential backoff;
 * otherwise moves it to DEAD_LETTER for the exception center (docs/REQUIREMENTS_MATRIX.md
 * #21, #27).
 */
export async function failJob(db: Kysely<Database>, job: WorkflowJobRow, error: string): Promise<JobStatus> {
  if (job.attempts >= job.max_attempts) {
    await db
      .updateTable("workflow_jobs")
      .set({ status: "DEAD_LETTER", last_error: error, updated_at: new Date(), locked_at: null, locked_by: null })
      .where("id", "=", job.id)
      .execute();
    return "DEAD_LETTER";
  }

  const backoffMs = calculateBackoffMs(job.attempts);
  await db
    .updateTable("workflow_jobs")
    .set({
      status: "QUEUED",
      last_error: error,
      available_at: new Date(Date.now() + backoffMs),
      locked_at: null,
      locked_by: null,
      updated_at: new Date(),
    })
    .where("id", "=", job.id)
    .execute();
  return "QUEUED";
}

/**
 * Restart-recovery (docs/TEST_STRATEGY.md scenario J): any job left IN_PROGRESS with a
 * lock older than `staleAfterMs` is assumed to belong to a worker process that crashed
 * mid-job, and is put back in the queue. Intended to run once at worker startup and
 * periodically thereafter.
 */
export async function requeueStaleJobs(db: Kysely<Database>, staleAfterMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const result = await db
    .updateTable("workflow_jobs")
    .set({ status: "QUEUED", locked_at: null, locked_by: null, updated_at: new Date() })
    .where("status", "=", "IN_PROGRESS")
    .where("locked_at", "<", cutoff)
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}
