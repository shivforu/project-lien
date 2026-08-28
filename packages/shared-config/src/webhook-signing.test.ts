import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "./webhook-signing.js";

describe("webhook signing", () => {
  it("verifies a signature produced with the same secret", () => {
    const body = JSON.stringify({ event: "package.status_changed" });
    const signature = signWebhookPayload("secret-1", body);
    expect(verifyWebhookSignature("secret-1", body, signature)).toBe(true);
  });

  it("rejects a signature produced with a different secret", () => {
    const body = JSON.stringify({ event: "package.status_changed" });
    const signature = signWebhookPayload("secret-1", body);
    expect(verifyWebhookSignature("secret-2", body, signature)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const signature = signWebhookPayload("secret-1", JSON.stringify({ a: 1 }));
    expect(verifyWebhookSignature("secret-1", JSON.stringify({ a: 2 }), signature)).toBe(false);
  });
});
