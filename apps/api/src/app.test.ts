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

  it("GET /api/v1/anything returns 501 until Phase 8 lands", async () => {
    const res = await request(app).get("/api/v1/releases");
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe("NOT_IMPLEMENTED");
  });

  it("sets an x-request-id header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});
