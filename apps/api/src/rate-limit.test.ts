import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Pool } from "pg";
import { getDb, runMigrations } from "@project-lien/db";
import { hashPassword } from "./auth/password.js";

/**
 * Rate limiting on `/auth/login` (docs/SECURITY.md, docs/DECISIONS.md D19) — a Phase 13
 * hardening item. Uses a deliberately low, test-only `RATE_LIMIT_LOGIN_MAX` (set on
 * `process.env` before `createApp()` reads it via `loadEnv()`) so this test doesn't need
 * to fire 10+ real requests to prove the limiter actually returns 429, not just that its
 * middleware is present. The override is undone in `afterAll` so it can't leak into other
 * test files sharing this worker process.
 */
const TEST_DATABASE_URL = process.env.DATABASE_URL!;
let app: Express;
// vitest.config.ts's own `env` block already set these process-wide (to generous
// test-suite defaults) before this file loaded — capture them so afterAll can restore the
// exact prior value rather than deleting the key outright, which would fall through to
// this schema's much lower production default (10) for any test file that happens to run
// afterward in the same worker process.
const previousLoginMax = process.env.RATE_LIMIT_LOGIN_MAX;
const previousLoginWindow = process.env.RATE_LIMIT_LOGIN_WINDOW_MS;

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(TEST_DATABASE_URL);

  const db = getDb();
  const org = await db.insertInto("organizations").values({ name: "Rate Limit Test Org", slug: "rate-limit-test-org" }).returning("id").executeTakeFirstOrThrow();
  const hash = await hashPassword("correct horse battery staple");
  const user = await db.insertInto("users").values({ email: "ratelimit@example.com", password_hash: hash, full_name: "Rate Limit User" }).returning("id").executeTakeFirstOrThrow();
  await db.insertInto("org_memberships").values({ organization_id: org.id, user_id: user.id, role: "ORG_ADMIN" }).execute();

  process.env.RATE_LIMIT_LOGIN_MAX = "3";
  process.env.RATE_LIMIT_LOGIN_WINDOW_MS = "60000";
  const { createApp } = await import("./app.js");
  app = createApp();
});

afterAll(async () => {
  if (previousLoginMax === undefined) delete process.env.RATE_LIMIT_LOGIN_MAX;
  else process.env.RATE_LIMIT_LOGIN_MAX = previousLoginMax;
  if (previousLoginWindow === undefined) delete process.env.RATE_LIMIT_LOGIN_WINDOW_MS;
  else process.env.RATE_LIMIT_LOGIN_WINDOW_MS = previousLoginWindow;
  await getDb().destroy();
});

describe("POST /api/v1/auth/login rate limiting", () => {
  it("allows up to RATE_LIMIT_LOGIN_MAX attempts, then returns 429", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/api/v1/auth/login").send({ email: "ratelimit@example.com", password: "wrong-password" });
      expect(res.status).toBe(401); // still a real login attempt, just a wrong password — counts against the limiter either way
    }
    const limited = await request(app).post("/api/v1/auth/login").send({ email: "ratelimit@example.com", password: "wrong-password" });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });

  it("does not apply the login-specific limit to unrelated routes", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});
