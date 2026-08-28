import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("app", () => {
  const app = createApp();

  it("GET /health returns 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("HEALTHY");
  });

  it("GET /api/v1/releases without a token returns 401 (auth required, docs/REQUIREMENTS_MATRIX.md #33)", async () => {
    const res = await request(app).get("/api/v1/releases");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("GET /api/v1/openapi.json serves the OpenAPI document unauthenticated", async () => {
    const res = await request(app).get("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.paths["/releases"]).toBeDefined();
  });

  it("sets an x-request-id header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});
