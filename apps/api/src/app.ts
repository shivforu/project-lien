import express, { type Express, type NextFunction, type Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "kysely";
import { getDb } from "@project-lien/db";
import { createLogger, loadEnv } from "@project-lien/shared-config";
import { requireAuth, type AuthenticatedRequest } from "./auth/middleware.js";
import { createAuthRouter } from "./routes/auth.js";
import { createJurisdictionsRouter } from "./routes/jurisdictions.js";
import { createFeesRouter } from "./routes/fees.js";
import { createPackagesRouter } from "./routes/packages.js";
import { createWebhooksRouter } from "./routes/webhooks.js";
import { createAuditEventsRouter } from "./routes/audit-events.js";
import { createExceptionsRouter } from "./routes/exceptions.js";
import { createIntegrationsRouter } from "./routes/integrations.js";

const logger = createLogger("api");

/**
 * Builds the Express app without starting a listener — kept separate from server.ts so
 * integration tests can exercise it with supertest without binding a port.
 */
export function createApp(): Express {
  const app = express();
  const db = getDb();
  const env = loadEnv();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "25mb" })); // PRIA/base64 document payloads

  // Correlation id on every request — see docs/SECURITY.md / docs/ARCHITECTURE.md.
  app.use((req, res, next) => {
    const requestId = (req.headers["x-request-id"] as string) || randomUUID();
    res.setHeader("x-request-id", requestId);
    (req as express.Request & { requestId: string }).requestId = requestId;
    next();
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "HEALTHY" });
  });

  app.get("/ready", async (_req, res) => {
    try {
      await sql`SELECT 1`.execute(db);
      res.status(200).json({ status: "READY", database: "CONNECTED" });
    } catch (err) {
      logger.error({ err }, "readiness check failed");
      res.status(503).json({ status: "NOT_READY", database: "DISCONNECTED" });
    }
  });

  // The OpenAPI document (apps/api/openapi.json, docs/REQUIREMENTS_MATRIX.md #32) is
  // served directly, unauthenticated — same convention as /health.
  app.get("/api/v1/openapi.json", (_req, res) => {
    // This project compiles to CommonJS (no package.json declares "type": "module" — see
    // docs/DECISIONS.md), so the ambient CJS `__dirname` is available here; `dist/app.js`
    // sits one directory below the package root where openapi.json lives.
    const spec = readFileSync(join(__dirname, "..", "openapi.json"), "utf8");
    res.type("application/json").send(spec);
  });

  // /auth/login is the one unauthenticated route on the v1 surface.
  app.use("/api/v1/auth", createAuthRouter(db, env));

  // Everything past this point requires a valid access token (docs/REQUIREMENTS_MATRIX.md #33).
  app.use("/api/v1", requireAuth(env.JWT_ACCESS_SECRET));

  app.use("/api/v1/jurisdictions", createJurisdictionsRouter(db));
  app.use("/api/v1/fees", createFeesRouter(db));
  app.use("/api/v1/releases", createPackagesRouter(db));
  app.use("/api/v1/webhooks", createWebhooksRouter(db));
  app.use("/api/v1/audit-events", createAuditEventsRouter(db));
  app.use("/api/v1/exceptions", createExceptionsRouter(db));
  app.use("/api/v1/integrations", createIntegrationsRouter(db));

  // Anything else on the versioned surface is honestly not implemented yet rather than
  // silently 404ing (docs/API.md lists the full target surface; this is the subset built
  // so far — see PROGRESS.md).
  app.use("/api/v1", (_req, res) => {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "This endpoint is not implemented yet. See PROGRESS.md." } });
  });

  // Centralized error handler — an unexpected thrown error becomes a 500 with a
  // correlation id, never a raw stack trace to the client (docs/SECURITY.md).
  app.use((err: unknown, req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    logger.error({ err, requestId: (req as express.Request & { requestId?: string }).requestId }, "unhandled error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  });

  return app;
}
