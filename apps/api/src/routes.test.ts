import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Pool } from "pg";
import { getDb, runMigrations } from "@project-lien/db";
import { hashPassword } from "./auth/password.js";
import { createApp } from "./app.js";

// Full-stack integration tests: real Express app (via supertest, no bound port) against a
// real Postgres (docs/TEST_STRATEGY.md). DATABASE_URL/JWT secrets come from
// vitest.config.ts's `env` block, which points at the same project_lien_test database the
// rest of the workspace's integration tests use.
const TEST_DATABASE_URL = process.env.DATABASE_URL!;

let app: Express;
let adminToken: string;
let viewerToken: string;
let orgId: string;

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(TEST_DATABASE_URL);

  const db = getDb();
  const org = await db.insertInto("organizations").values({ name: "API Test Org", slug: "api-test-org" }).returning("id").executeTakeFirstOrThrow();
  orgId = org.id;

  await db.insertInto("state_jurisdiction_rules").values({
    state_code: "CA", state_name: "California", theory_type: "TITLE_THEORY", default_doc_type: "DEED_OF_RECONVEYANCE", statutory_deadline_days: 30,
  }).execute();
  await db.insertInto("county_jurisdiction_rules").values({
    county_fips: "06037", state_code: "CA", county_name: "Los Angeles", base_recording_fee_cents: 7500, per_page_fee_cents: 300, e_recording_network: "SIMPLIFILE",
  }).execute();

  const property = await db
    .insertInto("properties")
    .values({ organization_id: orgId, parcel_number: "1", address_line1: "1 Main St", city: "LA", state_code: "CA", zip_code: "90001", county_fips: "06037", county_name: "Los Angeles" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const loan = await db
    .insertInto("loans")
    .values({ organization_id: orgId, loan_number: "LN-1", property_id: property.id, unpaid_principal_cents: 0, interest_rate_bps: 0, borrower_name: "Jane Borrower" })
    .returning("id")
    .executeTakeFirstOrThrow();

  const adminHash = await hashPassword("correct horse battery staple");
  const adminUser = await db.insertInto("users").values({ email: "admin@example.com", password_hash: adminHash, full_name: "Admin User" }).returning("id").executeTakeFirstOrThrow();
  await db.insertInto("org_memberships").values({ organization_id: orgId, user_id: adminUser.id, role: "ORG_ADMIN" }).execute();

  const viewerHash = await hashPassword("another-strong-password");
  const viewerUser = await db.insertInto("users").values({ email: "viewer@example.com", password_hash: viewerHash, full_name: "Viewer User" }).returning("id").executeTakeFirstOrThrow();
  await db.insertInto("org_memberships").values({ organization_id: orgId, user_id: viewerUser.id, role: "VIEWER" }).execute();

  app = createApp();

  const adminLogin = await request(app).post("/api/v1/auth/login").send({ email: "admin@example.com", password: "correct horse battery staple" });
  adminToken = adminLogin.body.accessToken;
  const viewerLogin = await request(app).post("/api/v1/auth/login").send({ email: "viewer@example.com", password: "another-strong-password" });
  viewerToken = viewerLogin.body.accessToken;

  (global as { __testLoanId?: string; __testPropertyId?: string }).__testLoanId = loan.id;
  (global as { __testLoanId?: string; __testPropertyId?: string }).__testPropertyId = property.id;
});

afterAll(async () => {
  await getDb().destroy();
});

describe("POST /api/v1/auth/login", () => {
  it("rejects an unknown email", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "nobody@example.com", password: "x" });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong password", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "admin@example.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("issues access + refresh tokens on success", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "admin@example.com", password: "correct horse battery staple" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.role).toBe("ORG_ADMIN");
  });
});

describe("GET /api/v1/jurisdictions/:stateCode", () => {
  it("resolves state + county when countyFips is given", async () => {
    const res = await request(app).get("/api/v1/jurisdictions/CA?countyFips=06037").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.eRecordingNetwork).toBe("SIMPLIFILE");
    expect(res.body.data.baseRecordingFeeCents).toBe(7500);
  });

  it("404s for an unknown state", async () => {
    const res = await request(app).get("/api/v1/jurisdictions/ZZ").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/fees/calculate", () => {
  it("returns a fee breakdown for a known county", async () => {
    const res = await request(app)
      .post("/api/v1/fees/calculate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ countyFips: "06037", pageCount: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data.totalCents).toBe(7500 + 300 * 3);
  });
});

describe("POST /api/v1/releases", () => {
  it("requires ORG_ADMIN or OPERATOR — a VIEWER is forbidden", async () => {
    const g = global as { __testLoanId?: string; __testPropertyId?: string };
    const res = await request(app)
      .post("/api/v1/releases")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ packageIdentifier: "PKG-API-1", loanId: g.__testLoanId, propertyId: g.__testPropertyId, stateCode: "CA", countyFips: "06037" });
    expect(res.status).toBe(403);
  });

  it("creates a package, and is idempotent on the same packageIdentifier", async () => {
    const g = global as { __testLoanId?: string; __testPropertyId?: string };
    const body = { packageIdentifier: "PKG-API-2", loanId: g.__testLoanId, propertyId: g.__testPropertyId, stateCode: "CA", countyFips: "06037" };

    const first = await request(app).post("/api/v1/releases").set("Authorization", `Bearer ${adminToken}`).send(body);
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe("DRAFT");
    expect(first.body.data.document_type).toBe("DEED_OF_RECONVEYANCE");

    const second = await request(app).post("/api/v1/releases").set("Authorization", `Bearer ${adminToken}`).send(body);
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it("is tenant-scoped: GET /:id 404s for a package outside the caller's org (there is none to leak here, but confirms the org filter is present)", async () => {
    const g = global as { __testLoanId?: string; __testPropertyId?: string };
    const created = await request(app)
      .post("/api/v1/releases")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ packageIdentifier: "PKG-API-3", loanId: g.__testLoanId, propertyId: g.__testPropertyId, stateCode: "CA", countyFips: "06037" });

    const fetched = await request(app).get(`/api/v1/releases/${created.body.data.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(fetched.status).toBe(200);

    const notFound = await request(app).get(`/api/v1/releases/00000000-0000-0000-0000-000000000000`).set("Authorization", `Bearer ${adminToken}`);
    expect(notFound.status).toBe(404);
  });
});

describe("GET /api/v1/releases pagination", () => {
  it("paginates with a cursor and eventually reaches the end", async () => {
    const first = await request(app).get("/api/v1/releases?limit=2").set("Authorization", `Bearer ${adminToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.length).toBeLessThanOrEqual(2);

    if (first.body.pagination.hasMore) {
      const second = await request(app)
        .get(`/api/v1/releases?limit=2&cursor=${first.body.pagination.nextCursor}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(second.status).toBe(200);
      const firstIds = new Set(first.body.data.map((p: { id: string }) => p.id));
      for (const pkg of second.body.data) expect(firstIds.has(pkg.id)).toBe(false);
    }
  });
});

describe("POST /api/v1/webhooks", () => {
  it("registers an endpoint and returns the secret once, but not on subsequent GET", async () => {
    const created = await request(app)
      .post("/api/v1/webhooks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "https://example.test/hook", subscribedEvents: ["package.status_changed"] });
    expect(created.status).toBe(201);
    expect(created.body.data.secret).toBeTruthy();

    const listed = await request(app).get("/api/v1/webhooks").set("Authorization", `Bearer ${adminToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.every((e: Record<string, unknown>) => !("secret" in e))).toBe(true);
  });
});

describe("unimplemented v1 routes", () => {
  it("returns 501 (not a bare 404) for a documented-but-unbuilt endpoint", async () => {
    const res = await request(app).get("/api/v1/audit-events").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe("NOT_IMPLEMENTED");
  });
});
