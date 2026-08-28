# Security Architecture

## Authentication & authorization
- Local email/password auth, argon2id password hashing, JWT access tokens (short TTL) +
  rotating refresh tokens, stored hashed. Interface-bound so SSO (SAML/OIDC via
  Auth0/Okta) can replace it later without touching authorization logic.
- RBAC roles scoped per organization (e.g., `org_admin`, `operator`, `viewer`,
  `api_client`). Every domain query is filtered by `organization_id`; there is no
  cross-tenant query path in the domain layer.
- API clients (developer/API area) authenticate via API keys (hashed at rest, prefix
  shown for identification) or OAuth2 client-credentials for server-to-server LOS/TMS
  integrations.

## Transport & storage
- TLS everywhere in deployed environments (local dev may run plain HTTP behind
  docker-compose; documented as dev-only).
- Documents at rest: MinIO locally / S3+KMS in production, both behind
  `IDocumentStorage`; object keys never guessable (UUID-based), signed URLs for
  time-limited access.
- Secrets only via environment variables / secret manager in production; `.env.example`
  ships with placeholders, `.env` is gitignored, and CI includes a secret-scan step.

## Application security
- All inbound payloads validated with Zod schemas at the API boundary before touching
  domain code.
- File uploads (document scans) validated for MIME type, size cap, and passed through a
  malware-scan interface (`IMalwareScanner`) — mock/no-op scanner locally, pluggable for
  a real scanner (e.g., ClamAV, a cloud AV API) in production.
- Rate limiting middleware on all public API routes (token-bucket per API key/IP);
  security headers via `helmet`.
- Webhook signing: HMAC-SHA256 over the raw payload with a per-endpoint secret; delivery
  timestamps included to mitigate replay.
- Idempotency keys required on all mutating POST endpoints that trigger vendor
  submission, preventing duplicate-submission from a retried client request.

## Auditability & PII
- `audit_events` is append-only (no update/delete path in the domain layer) and captures
  actor, action, before/after where relevant, and correlation id.
- Structured logs are PII-aware: borrower name/SSN-adjacent fields are never logged in
  full; log statements pass through a redaction helper for known-sensitive field names.
- mTLS capability is architected for service-to-service calls in production (e.g.,
  worker → a future real vendor SOAP endpoint) but not required for local dev.

## What's explicitly deferred
Real HSM/KMS key management, a live WAF, and a real malware-scanning engine are out of
scope for local development and tracked as production hardening items in
docs/DEPLOYMENT.md's launch checklist — building fake versions of these would be worse
than naming the gap.
