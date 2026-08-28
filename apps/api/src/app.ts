import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { getDb } from "@project-lien/db";
import { createLogger } from "@project-lien/shared-config";

const logger = createLogger("api");

/**
 * Builds the Express app without starting a listener — kept separate from server.ts so
 * integration tests (Phase 8+) can exercise it with supertest without binding a port.
 */
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "25mb" })); // PRIA/base64 payloads land here in Phase 4+

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
      await sql`SELECT 1`.execute(getDb());
      res.status(200).json({ status: "READY", database: "CONNECTED" });
    } catch (err) {
      logger.error({ err }, "readiness check failed");
      res.status(503).json({ status: "NOT_READY", database: "DISCONNECTED" });
    }
  });

  // Versioned API surface — controllers land here starting Phase 8 (docs/API.md).
  app.use("/api/v1", (_req, res) => {
    res.status(501).json({
      error: {
        code: "NOT_IMPLEMENTED",
        message: "The v1 API surface is built out in Phase 8. See PROGRESS.md.",
      },
    });
  });

  return app;
}
