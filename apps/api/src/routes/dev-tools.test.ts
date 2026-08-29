import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import type { Env } from "@project-lien/shared-config";
import { createDevToolsRouter } from "./dev-tools.js";

// Unit-level: only the production gate itself. The router's real behavior (walking a
// package READY -> READY_TO_SUBMIT) is covered end-to-end against a real Postgres in
// ../routes.test.ts — this file exists purely to prove the one safeguard that makes this
// dev-only router safe to ship at all: it must be unreachable when NODE_ENV=production. The
// route body never runs in either case here, so a stub `db` is fine.
const stubDb = {} as Kysely<Database>;

function buildApp(nodeEnv: Env["NODE_ENV"]) {
  const app = express();
  app.use(express.json());
  // The real auth middleware isn't mounted here — this test only needs to prove the
  // production check runs (and short-circuits) before anything else, including auth.
  app.use("/api/v1/dev", createDevToolsRouter(stubDb, { NODE_ENV: nodeEnv } as Env));
  return app;
}

describe("createDevToolsRouter production gate", () => {
  it("404s every route when NODE_ENV=production, before auth or the handler ever run", async () => {
    const app = buildApp("production");
    const res = await request(app).post("/api/v1/dev/releases/some-id/advance-to-ready-to-submit");
    expect(res.status).toBe(404);
  });

  it("does not 404 in development (falls through to requireRole, which 401s with no token)", async () => {
    const app = buildApp("development");
    const res = await request(app).post("/api/v1/dev/releases/some-id/advance-to-ready-to-submit");
    // No Authorization header and no requireAuth middleware mounted here means req.auth is
    // undefined by the time requireRole runs — proving the request reached past the
    // production gate (a 404 there would look identical to this if the gate over-matched).
    expect(res.status).toBe(401);
  });

  it("does not 404 in test env either", async () => {
    const app = buildApp("test");
    const res = await request(app).post("/api/v1/dev/releases/some-id/advance-to-ready-to-submit");
    expect(res.status).toBe(401);
  });
});
