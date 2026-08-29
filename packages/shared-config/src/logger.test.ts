import { describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import { createLogger } from "./logger.js";

/**
 * `createLogger`'s `redact` config was written (docs/SECURITY.md) but never actually
 * exercised by a test — this is exactly the kind of "claimed but unverified" gap this
 * project's mandate requires closing (Phase 13 security hardening pass). Captures real
 * emitted JSON from `createLogger` itself (via the optional `destination` param it now
 * accepts) rather than duplicating its redact config in the test, so a typo in a redact
 * path — which pino would silently no-op on — would actually be caught here.
 */
function captureLogLine(log: (logger: ReturnType<typeof createLogger>) => void): Record<string, unknown> {
  let captured = "";
  const stream = new Writable({
    write(chunk, _enc, callback) {
      captured += chunk.toString();
      callback();
    },
  });
  const logger = createLogger("test", stream);
  log(logger);
  return JSON.parse(captured.trim());
}

describe("createLogger redaction", () => {
  it("redacts a password field nested under an arbitrary top-level key", () => {
    const line = captureLogLine((logger) => logger.info({ user: { email: "a@b.com", password: "hunter2" } }, "login attempt"));
    expect((line.user as Record<string, unknown>).password).toBe("[REDACTED]");
    expect((line.user as Record<string, unknown>).email).toBe("a@b.com");
  });

  it("redacts passwordHash, ssn, and API-key-shaped fields", () => {
    const line = captureLogLine((logger) =>
      logger.info({ user: { passwordHash: "$2a$...", ssn: "123-45-6789" }, client: { apiKey: "sk_live_abc", hashedKey: "abc123" } }, "sensitive fields"),
    );
    expect((line.user as Record<string, unknown>).passwordHash).toBe("[REDACTED]");
    expect((line.user as Record<string, unknown>).ssn).toBe("[REDACTED]");
    expect((line.client as Record<string, unknown>).apiKey).toBe("[REDACTED]");
    expect((line.client as Record<string, unknown>).hashedKey).toBe("[REDACTED]");
  });

  it("redacts the raw Authorization header when a request object is logged", () => {
    const line = captureLogLine((logger) => logger.info({ req: { headers: { authorization: "Bearer secret-token" } } }, "request"));
    expect((line.req as { headers: Record<string, unknown> }).headers.authorization).toBe("[REDACTED]");
  });

  it("leaves ordinary fields untouched", () => {
    const line = captureLogLine((logger) => logger.info({ packageId: "pkg-1", status: "READY" }, "package ready"));
    expect(line.packageId).toBe("pkg-1");
    expect(line.status).toBe("READY");
  });
});
