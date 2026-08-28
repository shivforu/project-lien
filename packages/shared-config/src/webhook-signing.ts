import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 webhook signing (docs/SECURITY.md). Each `webhook_endpoints` row has its
 * own per-endpoint secret (generated at registration time, shown to the caller once) —
 * this is the shared signing primitive both the delivering worker and, in a real
 * subscriber, the receiving server would use.
 */
export function signWebhookPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyWebhookSignature(secret: string, rawBody: string, signature: string): boolean {
  const expected = signWebhookPayload(secret, rawBody);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
