import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "./migrate.js";

// Integration test — requires a real Postgres reachable at TEST_DATABASE_URL. This is
// intentional: the point of this test is proving migrations actually apply against a
// real database engine, not against a mock. See docs/TEST_STRATEGY.md.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/project_lien_test";

describe("runMigrations", () => {
  it("applies all migrations from empty and is idempotent on a second run", async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    // Reset to a clean slate so this test is deterministic regardless of run order.
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await pool.end();

    const first = await runMigrations(TEST_DATABASE_URL);
    expect(first.applied).toContain("0001_init.sql");

    const second = await runMigrations(TEST_DATABASE_URL);
    expect(second.applied).toEqual([]);

    const verifyPool = new Pool({ connectionString: TEST_DATABASE_URL });
    const tables = await verifyPool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "organizations",
        "state_jurisdiction_rules",
        "county_jurisdiction_rules",
        "recording_packages",
        "workflow_jobs",
        "ledger_transactions",
      ]),
    );
    await verifyPool.end();
  });
});
