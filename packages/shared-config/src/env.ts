import { z } from "zod";

/**
 * Single source of truth for required/optional environment variables. Fails fast at
 * process startup with a clear message rather than surfacing a confusing error deep in
 * a request handler later — matters a lot once vendor adapters and storage config are
 * wired in (Phase 3+).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  API_PORT: z.coerce.number().default(4000),
  WEB_PORT: z.coerce.number().default(3000),
  JWT_ACCESS_SECRET: z.string().default("dev-only-change-me-access"),
  JWT_REFRESH_SECRET: z.string().default("dev-only-change-me-refresh"),
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
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(source);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
