import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 20000,
    // Every test file in this package shares one real Postgres database and several
    // reset it (DROP SCHEMA ... CASCADE) in beforeAll — running files in parallel would
    // race two resets against each other, so they run one at a time instead.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/project_lien_test",
      JWT_ACCESS_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      WEBHOOK_SIGNING_SECRET: "test-webhook-secret",
      // Generous test-wide defaults so ordinary functional tests never spuriously trip the
      // Phase 13 rate limiters as the suite grows — the limiters' actual behavior is
      // covered deliberately, with its own low per-file override, in rate-limit.test.ts.
      RATE_LIMIT_LOGIN_MAX: "1000",
      RATE_LIMIT_API_MAX: "10000",
    },
  },
});
