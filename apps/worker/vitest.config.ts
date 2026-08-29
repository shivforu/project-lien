import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
    // Every test file in this package resets a shared real Postgres database
    // (DROP SCHEMA ... CASCADE) in beforeAll — running files in parallel would race two
    // resets against each other (same fix as apps/api/vitest.config.ts, needed once the
    // e2e-scenarios suite joined the other handler tests here in Phase 12).
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/project_lien_test",
      JWT_ACCESS_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      WEBHOOK_SIGNING_SECRET: "test-webhook-secret",
    },
  },
});
