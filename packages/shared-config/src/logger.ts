import pino from "pino";

/**
 * Structured, PII-aware logger. `redact` strips known-sensitive field names at the
 * pino level (belt-and-suspenders on top of call-site discipline) — see docs/SECURITY.md.
 *
 * `destination` defaults to pino's normal stdout stream in real use; tests pass an
 * in-memory `Writable` so the redaction config can be verified against real emitted JSON
 * rather than just asserted as an object shape (Phase 13 — see logger.test.ts, closing a
 * gap where this config had never actually been exercised by a test).
 */
export function createLogger(name: string, destination?: NodeJS.WritableStream) {
  return pino(
    {
      name,
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "*.password",
          "*.passwordHash",
          "*.ssn",
          "*.borrowerSsn",
          "*.apiKey",
          "*.hashedKey",
          "req.headers.authorization",
        ],
        censor: "[REDACTED]",
      },
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}

export type Logger = ReturnType<typeof createLogger>;
