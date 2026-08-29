import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Pool } from "pg";
import { runMigrations, getDb } from "@project-lien/db";

/**
 * `CORS_ORIGIN` as a real allowlist, not just the "*" dev default exercised in
 * app.test.ts (docs/DECISIONS.md D19). Sets `process.env.CORS_ORIGIN` before importing
 * `./app.js` so `createApp()`'s `loadEnv()` call picks it up — this file gets its own
 * isolated module registry from vitest, so the override doesn't leak into other files.
 */
const TEST_DATABASE_URL = process.env.DATABASE_URL!;
let app: Express;

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(TEST_DATABASE_URL);

  process.env.CORS_ORIGIN = "https://allowed.example.com,https://also-allowed.example.com";
  const { createApp } = await import("./app.js");
  app = createApp();
});

afterAll(async () => {
  delete process.env.CORS_ORIGIN;
  await getDb().destroy();
});

describe("CORS allowlist", () => {
  it("reflects an allowed origin", async () => {
    const res = await request(app).get("/health").set("Origin", "https://allowed.example.com");
    expect(res.headers["access-control-allow-origin"]).toBe("https://allowed.example.com");
  });

  it("does not reflect an origin outside the allowlist", async () => {
    const res = await request(app).get("/health").set("Origin", "https://not-allowed.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
