import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCacheForTests } from "./env.js";

describe("loadEnv", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
  });

  it("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it("defaults CORS_ORIGIN and rate-limit settings when unset", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://x" } as NodeJS.ProcessEnv);
    expect(env.CORS_ORIGIN).toBe("*");
    expect(env.RATE_LIMIT_LOGIN_MAX).toBe(10);
    expect(env.RATE_LIMIT_API_MAX).toBe(300);
  });

  it("refuses to start in production with a secret still at its insecure dev default (docs/DECISIONS.md D19)", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://x",
        JWT_ACCESS_SECRET: "dev-only-change-me-access",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/insecure development default/);
  });

  it("starts in production once every secret has been overridden", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
      JWT_ACCESS_SECRET: "a-real-access-secret",
      JWT_REFRESH_SECRET: "a-real-refresh-secret",
      WEBHOOK_SIGNING_SECRET: "a-real-webhook-secret",
      STORAGE_SECRET_KEY: "a-real-storage-secret",
    } as unknown as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe("production");
  });

  it("does not block development/test even with the placeholder secrets", () => {
    expect(() => loadEnv({ DATABASE_URL: "postgres://x" } as NodeJS.ProcessEnv)).not.toThrow();
  });
});
