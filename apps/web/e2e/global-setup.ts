import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { Client } from "pg";

/**
 * Boots the real, compiled stack (Postgres schema, api, worker, web) against a
 * dedicated e2e database, so `apps/web/e2e/*.spec.ts` drives an actually-running system
 * end to end rather than a component-level mock — the same standard every other phase's
 * tests in this repo hold (docs/DECISIONS.md project mandate). This closes a real gap:
 * before Phase 15, the operations UI (docs/REQUIREMENTS_MATRIX.md #25-30) had only ever
 * been checked with one-off manual Playwright scripts during Phase 10/11, never a
 * committed, repeatable automated suite.
 *
 * Uses the "globalSetup returns its own teardown" pattern (Playwright's recommended
 * approach) so setup and teardown share closures over the spawned child processes
 * without a PID file on disk.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const ADMIN_DATABASE_URL = process.env.E2E_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const TEST_DB_NAME = "project_lien_e2e_web";
export const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;
export const API_BASE_URL = "http://127.0.0.1:4000";
export const WEB_BASE_URL = "http://127.0.0.1:3100";

async function recreateDatabase(): Promise<void> {
  const client = new Client({ connectionString: ADMIN_DATABASE_URL });
  await client.connect();
  try {
    // Kick any lingering connections from a prior interrupted run before dropping.
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await client.end();
  }
}

function runToCompletion(scriptPath: string, env: NodeJS.ProcessEnv): void {
  execFileSync("node", [scriptPath], { env, stdio: "inherit" });
}

function spawnProcess(label: string, scriptPath: string, env: NodeJS.ProcessEnv, cwd = REPO_ROOT, args: string[] = []): ChildProcess {
  const child = spawn("node", [scriptPath, ...args], { env, cwd, stdio: "pipe" });
  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[e2e:${label}] ${chunk}`));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[e2e:${label}] ${chunk}`));
  return child;
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`${url} responded ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url} to become ready: ${String(lastError)}`);
}

/** Best-effort: clears a port a previous, ungracefully-terminated run may have left
 * bound (observed once during this suite's own development — see the note by the `web`
 * spawn below). Never throws; a clean environment just has nothing to kill. */
function killWhoeverIsOnPort(port: number): void {
  try {
    execFileSync("bash", ["-c", `lsof -ti:${port} | xargs -r kill -9`], { stdio: "ignore" });
  } catch {
    // No lsof, or nothing listening — either way, nothing to do.
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  killWhoeverIsOnPort(4000);
  killWhoeverIsOnPort(3100);
  await recreateDatabase();

  const dbEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  runToCompletion(path.join(REPO_ROOT, "packages/db/dist/migrate.js"), dbEnv);
  runToCompletion(path.join(REPO_ROOT, "packages/db/dist/seed.js"), dbEnv);

  const sharedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    NODE_ENV: "development",
    LOG_LEVEL: "warn",
    // Generous relative to the default (10/15min) so a handful of test logins/retries
    // across one Playwright run can never be spuriously rate-limited (same reasoning
    // as apps/api/vitest.config.ts's test-wide overrides, docs/DECISIONS.md D19).
    RATE_LIMIT_LOGIN_MAX: "1000",
    RATE_LIMIT_API_MAX: "5000",
  };

  const api = spawnProcess("api", path.join(REPO_ROOT, "apps/api/dist/server.js"), {
    ...sharedEnv,
    API_PORT: "4000",
  });

  const worker = spawnProcess("worker", path.join(REPO_ROOT, "apps/worker/dist/index.js"), {
    ...sharedEnv,
    WORKER_POLL_INTERVAL_MS: "1000",
  });

  // `next start` reads PORT for its default when -p isn't passed. NEXT_PUBLIC_API_BASE_URL
  // is intentionally NOT set here — it's a build-time-inlined var, and apps/web was already
  // built (turbo's test:e2e task depends on build) without it set, so the client bundle
  // already falls back to its compiled-in default of http://localhost:4000, which is why
  // the api above binds exactly that port rather than a free one.
  //
  // Spawned via apps/web's own node_modules/.bin/next directly (not `pnpm --filter ...
  // start`) so this is a single, directly-killable child process — a `pnpm run` wrapper
  // interposes its own process between this one and the actual `next-server`, and a
  // SIGTERM to the wrapper doesn't reliably reach the grandchild, which is exactly what
  // left a `next-server` orphaned on port 3100 across runs during this suite's own
  // development (a real bug this phase's own tooling caught in itself).
  const web = spawnProcess(
    "web",
    path.join(REPO_ROOT, "apps/web", "node_modules", "next", "dist", "bin", "next"),
    { ...sharedEnv, PORT: "3100" },
    path.join(REPO_ROOT, "apps/web"),
    ["start"],
  );

  try {
    await Promise.all([
      waitForUrl(`${API_BASE_URL}/health`, 20_000),
      waitForUrl(`${API_BASE_URL}/ready`, 20_000),
      waitForUrl(`${WEB_BASE_URL}/login`, 30_000),
    ]);
  } catch (err) {
    api.kill();
    worker.kill();
    web.kill();
    throw err;
  }

  return async function globalTeardown(): Promise<void> {
    for (const child of [api, worker, web]) {
      child.kill("SIGTERM");
    }
    // Give each process a moment to actually exit before we try to drop the database
    // they're connected to.
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const client = new Client({ connectionString: ADMIN_DATABASE_URL });
      await client.connect();
      await client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [TEST_DB_NAME],
      );
      await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
      await client.end();
    } catch {
      // Best-effort cleanup only — leaving the e2e database behind doesn't affect any
      // other suite (it's a dedicated name distinct from project_lien/project_lien_test)
      // and the next run's recreateDatabase() call drops and recreates it anyway.
    }
  };
}
