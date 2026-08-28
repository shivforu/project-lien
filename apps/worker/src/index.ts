import { sql } from "kysely";
import { getDb } from "@project-lien/db";
import { loadEnv, createLogger } from "@project-lien/shared-config";

/**
 * Worker process entrypoint. This currently proves out the shape (DB connectivity,
 * polling loop, graceful shutdown) that Phase 6's real job-claiming logic
 * (`workflow_jobs`, `FOR UPDATE SKIP LOCKED`, retry/backoff/dead-letter — see
 * docs/DECISIONS.md D3) will run inside. Deliberately not claiming real jobs yet: there
 * are no job producers until the API/orchestrator exist (Phase 6+), and a worker that
 * claims nothing is not the same as a worker that's been verified end-to-end — that
 * verification happens in Phase 6, not here.
 */

const env = loadEnv();
const logger = createLogger("worker");

let running = true;

async function tick(): Promise<void> {
  try {
    await sql`SELECT 1`.execute(getDb());
    logger.debug("worker heartbeat: database reachable");
  } catch (err) {
    logger.error({ err }, "worker heartbeat: database unreachable");
  }
}

async function main() {
  logger.info({ pollIntervalMs: env.WORKER_POLL_INTERVAL_MS }, "worker starting");

  while (running) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS));
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
