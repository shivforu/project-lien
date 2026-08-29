import { z } from "zod";

/**
 * Single source of truth for required/optional environment variables. Fails fast at
 * process startup with a clear message rather than surfacing a confusing error deep in
 * a request handler later — matters a lot once vendor adapters and storage config are
 * wired in (Phase 3+).
 */
/** Secrets that ship with an insecure, obviously-labeled development default. A
 * production process that still has one of these values means the corresponding
 * environment variable was never actually set — see the production-only check below. */
const INSECURE_DEV_DEFAULTS = new Set([
  "dev-only-change-me-access",
  "dev-only-change-me-refresh",
  "dev-only-change-me-webhook",
  "minioadmin",
]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  API_PORT: z.coerce.number().default(4000),
  WEB_PORT: z.coerce.number().default(3000),
  JWT_ACCESS_SECRET: z.string().default("dev-only-change-me-access"),
  JWT_REFRESH_SECRET: z.string().default("dev-only-change-me-refresh"),
  // .env.example documented these as configurable since Phase 1, but nothing ever read
  // them — signAccessToken/signRefreshToken had "15m"/"7d" hardcoded. Wired for real in
  // Phase 13 (docs/DECISIONS.md D19). The regex matches the `ms`-package duration shapes
  // `jsonwebtoken`'s `expiresIn` option accepts (e.g. `15m`, `1h`, `7d`) — validated here,
  // at the one place a human types this value, rather than only failing inside a signing
  // call deep in a request handler.
  JWT_ACCESS_TTL: z.string().regex(/^\d+(ms|s|m|h|d|w|y)$/, "must look like a duration, e.g. 15m, 1h, 7d").default("15m"),
  JWT_REFRESH_TTL: z.string().regex(/^\d+(ms|s|m|h|d|w|y)$/, "must look like a duration, e.g. 15m, 1h, 7d").default("7d"),
  STORAGE_DRIVER: z.enum(["minio", "s3"]).default("minio"),
  STORAGE_ENDPOINT: z.string().default("http://localhost:9000"),
  STORAGE_REGION: z.string().default("us-east-1"),
  STORAGE_BUCKET: z.string().default("project-lien-documents"),
  STORAGE_ACCESS_KEY: z.string().default("minioadmin"),
  STORAGE_SECRET_KEY: z.string().default("minioadmin"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  WORKER_JOB_CLAIM_TIMEOUT_MS: z.coerce.number().default(120000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().default(5),
  WEBHOOK_SIGNING_SECRET: z.string().default("dev-only-change-me-webhook"),
  // Comma-separated allowlist of origins the API's CORS middleware accepts; "*" (the
  // default, dev-only) reflects any origin, matching the previous unconfigured `cors()`
  // behavior (docs/SECURITY.md, docs/DECISIONS.md D19).
  CORS_ORIGIN: z.string().default("*"),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().default(10),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_API_MAX: z.coerce.number().default(300),
  RATE_LIMIT_API_WINDOW_MS: z.coerce.number().default(60 * 1000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Fails fast at process startup — the same "clear message now, not a confusing error
 * later" philosophy as the schema parse above — if a production process is still running
 * on one of the placeholder secrets `.env.example` ships with. A secret left at its
 * obviously-labeled dev default in production is a real, load-bearing gap (anyone who has
 * read this file could forge tokens/signatures), not a style nit, so it blocks startup
 * rather than just logging a warning (docs/DECISIONS.md D19).
 */
function assertNoInsecureDefaultsInProduction(env: Env): void {
  if (env.NODE_ENV !== "production") return;
  const offending: [string, string][] = (
    [
      ["JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET],
      ["JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET],
      ["WEBHOOK_SIGNING_SECRET", env.WEBHOOK_SIGNING_SECRET],
      ["STORAGE_SECRET_KEY", env.STORAGE_SECRET_KEY],
    ] satisfies [string, string][]
  ).filter(([, value]) => INSECURE_DEV_DEFAULTS.has(value));
  if (offending.length > 0) {
    const names = offending.map(([name]) => name).join(", ");
    throw new Error(
      `Refusing to start with NODE_ENV=production while these secrets are still at their insecure development default: ${names}. Set real values via environment variables or a secret manager.`,
    );
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(source);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    assertNoInsecureDefaultsInProduction(parsed.data);
    cached = parsed.data;
  }
  return cached;
}

/** Test-only escape hatch: the module-level cache means once `loadEnv` has been called in
 * a process, later calls (even with a different `source`) return the same cached value —
 * necessary for real request handling, but it means tests that need to exercise different
 * env configurations must be able to reset it between cases. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}
