import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "@project-lien/db";
import { runMigrations } from "@project-lien/db";
import { recordAuditEvent } from "./audit-log.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/project_lien_test";
let db: Kysely<Database>;

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(TEST_DATABASE_URL);
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_DATABASE_URL }) }) });
});

afterAll(async () => {
  await db.destroy();
});

describe("recordAuditEvent", () => {
  it("appends an immutable row with the given actor/action/entity", async () => {
    const org = await db.insertInto("organizations").values({ name: "Test Org", slug: "test-org" }).returning("id").executeTakeFirstOrThrow();

    await recordAuditEvent(db, {
      organizationId: org.id,
      actorType: "USER",
      action: "package.created",
      entityType: "recording_package",
      entityId: "pkg-1",
      details: { packageIdentifier: "PKG-1" },
    });

    const rows = await db.selectFrom("audit_events").selectAll().where("organization_id", "=", org.id).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("package.created");
    expect(rows[0]?.entity_type).toBe("recording_package");
    expect(rows[0]?.details).toEqual({ packageIdentifier: "PKG-1" });
  });

  it("allows a system-level event with no organization", async () => {
    await recordAuditEvent(db, { organizationId: null, actorType: "SYSTEM", action: "worker.started", entityType: "process" });
    const rows = await db.selectFrom("audit_events").selectAll().where("action", "=", "worker.started").execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.organization_id).toBeNull();
  });
});
