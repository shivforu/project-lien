import { sql } from "kysely";
import { getDb } from "@project-lien/db";
import { loadEnv, createLogger } from "@project-lien/shared-config";
import { claimNextJob, completeJob, enqueueJob, failJob, requeueStaleJobs } from "@project-lien/domain-workflow";
import { JOB_HANDLERS } from "./job-dispatcher.js";

/**
 * Worker process entrypoint: claims jobs from the `workflow_jobs` table using
 * `FOR UPDATE SKIP LOCKED` (docs/DECISIONS.md D3, docs/REQUIREMENTS_MATRIX.md #21),
 * dispatches them to a handler by `job_type`, and retries with backoff or dead-letters on
 * failure. On startup, any job left IN_PROGRESS by a crashed previous worker process is
 * requeued (restart-recovery, docs/TEST_STRATEGY.md scenario J).
 */

const env = loadEnv();
const logger = createLogger("worker");
const db = getDb();
const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

let running = true;

async function heartbeat(): Promise<void> {
  try {
    await sql`SELECT 1`.execute(db);
  } catch (err) {
    logger.error({ err }, "worker heartbeat: database unreachable");
  }
}

async function processOneJob(): Promise<boolean> {
  const job = await claimNextJob(db, workerId);
  if (!job) return false;

  const handler = JOB_HANDLERS[job.job_type];
  if (!handler) {
    logger.error({ jobId: job.id, jobType: job.job_type }, "no handler registered for job type — dead-lettering");
    await failJob(db, job, `No handler registered for job_type '${job.job_type}'`);
    return true;
  }

  try {
    await handler(job.payload, { db, logger });
    await completeJob(db, job.id);
    logger.info({ jobId: job.id, jobType: job.job_type }, "job completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const outcome = await failJob(db, job, message);
    logger.error({ jobId: job.id, jobType: job.job_type, err, outcome }, "job failed");
  }
  return true;
}

async function main() {
  logger.info({ pollIntervalMs: env.WORKER_POLL_INTERVAL_MS, workerId }, "worker starting");

  const requeued = await requeueStaleJobs(db, env.WORKER_JOB_CLAIM_TIMEOUT_MS);
  if (requeued > 0) logger.warn({ requeued }, "requeued stale in-progress jobs from a previous run");

  // Seed the self-rescheduling statutory deadline scan exactly once, ever: the fixed
  // idempotencyKey means every later worker boot's attempt to seed it collides with the
  // row this first successful seed leaves behind (unique constraints in Postgres are
  // permanent, not scoped to QUEUED status) and safely no-ops — the scan chain itself
  // keeps running via its own keyless self-reschedule in statutory-deadline-scan.ts, so
  // this only needs to fire the very first time (docs/REQUIREMENTS_MATRIX.md #21).
  await enqueueJob(db, {
    packageId: null,
    jobType: "STATUTORY_DEADLINE_SCAN",
    payload: {},
    idempotencyKey: "statutory-deadline-scan-singleton",
  });

  while (running) {
    await heartbeat();
    const claimed = await processOneJob();
    if (!claimed) {
      await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS));
    }
  }
}

function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  running = false;
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((err) => {
  logger.error({ err }, "worker crashed");
  process.exit(1);
});
