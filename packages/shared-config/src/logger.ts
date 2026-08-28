import pino from "pino";

/**
 * Structured, PII-aware logger. `redact` strips known-sensitive field names at the
 * pino level (belt-and-suspenders on top of call-site discipline) — see docs/SECURITY.md.
 */
export function createLogger(name: string) {
  return pino({
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
  });
}

export type Logger = ReturnType<typeof createLogger>;
