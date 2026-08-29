# Security Architecture

This document originally described a target architecture written before most of it was
built. Phase 13 (security hardening) went through every claim below against the actual
code and corrected what didn't match — see docs/DECISIONS.md D19. Anything still marked
"deferred" is a real, acknowledged gap, not an oversight.

## Authentication & authorization
- Local email/password auth. Passwords are hashed with **bcryptjs** (cost factor 10), not
  argon2id as originally planned here — a deliberate, documented deviation
  (docs/DECISIONS.md D2) to avoid a native-binary dependency after the Prisma incident
  referenced there. `apps/api/src/auth/password.ts`.
- JWT access tokens (15-minute default TTL, `JWT_ACCESS_TTL`) and refresh tokens
  (7-day default TTL, `JWT_REFRESH_TTL`), both configurable per environment
  (docs/DECISIONS.md D19). `POST /api/v1/auth/refresh` actually consumes a refresh token
  to mint a new access/refresh pair — this endpoint didn't exist before Phase 13, so a
  refresh token was issued at login but had nowhere to be redeemed. Refresh tokens are
  **not** stored server-side, hashed or otherwise, and there is no revocation list: a
  refresh token is valid until it expires or its signing secret is rotated, whichever
  comes first. A real revocation path (e.g. a `token_versions` column bumped on password
  change / explicit logout) is a real gap, tracked here rather than silently claimed.
  Interface-bound so a real IdP (SAML/OIDC via Auth0/Okta) could replace local auth later
  without touching authorization logic.
- RBAC roles scoped per organization: `ORG_ADMIN`, `OPERATOR`, `VIEWER`, `API_CLIENT`.
  Every domain query is filtered by `organization_id`; there is no cross-tenant query path
  in the domain layer (verified in `apps/api/src/routes.test.ts`'s tenant-isolation cases).
  `API_CLIENT` is a defined role with no actual authentication mechanism behind it yet —
  API-key auth for the developer/API area is NOT_STARTED (docs/REQUIREMENTS_MATRIX.md #31).

## Transport & storage
- TLS everywhere in deployed environments (local dev runs plain HTTP behind
  docker-compose; documented as dev-only).
- Documents at rest: MinIO locally / a real `LocalFsDocumentStorage` disk implementation,
  both behind `IDocumentStorage` (docs/REQUIREMENTS_MATRIX.md #35); S3+KMS in production is
  a config swap per docs/DECISIONS.md D12, not yet exercised against a real AWS account.
- Secrets only via environment variables / secret manager in production. `.env.example`
  ships with obviously-labeled placeholders (`dev-only-change-me-*`), `.env` is gitignored,
  and — new in Phase 13 — a production process (`NODE_ENV=production`) now **refuses to
  start** if any of `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `WEBHOOK_SIGNING_SECRET`, or
  `STORAGE_SECRET_KEY` is still at that placeholder value
  (`packages/shared-config/src/env.ts`, `assertNoInsecureDefaultsInProduction`, covered by
  `env.test.ts`). CI running a secret-scan step is aspirational — not yet built
  (docs/REQUIREMENTS_MATRIX.md #38, tracked for Phase 14).

## Application security
- Inbound payloads with a request body are validated with Zod schemas at the API boundary
  (`auth`, `fees`, `packages`, `webhooks` routers) before touching domain code; routes that
  only take a path parameter and no body (most of `package-actions`, `exceptions`,
  `integrations`, `audit-events`) rely on existence/ownership/status checks instead, since
  there's no body shape to validate.
- File uploads: no document-scan upload endpoint exists yet in this build (documents are
  generated server-side, not uploaded), so `IMalwareScanner` remains a named-but-unbuilt
  interface rather than a real gap being papered over — nothing calls it.
- Rate limiting (new in Phase 13, `express-rate-limit`, in-memory per-process store keyed
  by IP — not the token-bucket-per-API-key design originally sketched here, since there is
  no API-key auth to key by yet): a tight window on `POST /auth/login`
  (`RATE_LIMIT_LOGIN_MAX`/`RATE_LIMIT_LOGIN_WINDOW_MS`, default 10 attempts / 15 minutes)
  and a looser general limit across the rest of `/api/v1`
  (`RATE_LIMIT_API_MAX`/`RATE_LIMIT_API_WINDOW_MS`, default 300 requests / minute). Covered
  by `apps/api/src/rate-limit.test.ts`. Security headers via `helmet`; CORS is now a real
  configurable allowlist (`CORS_ORIGIN`, comma-separated; `*` is the dev-only default) —
  covered by `apps/api/src/cors.test.ts` — rather than the previous unconfigured
  wide-open `cors()`.
- Webhook signing: HMAC-SHA256 over the raw payload with a per-endpoint secret
  (`packages/shared-config/src/webhook-signing.ts`).
- Idempotency keys on mutating endpoints that trigger vendor submission
  (`POST /releases/:id/submit`), scoped per submission *attempt* since Phase 13
  (docs/DECISIONS.md D18) — a package-lifetime key would have permanently blocked a
  legitimate resubmission after the first attempt, a real bug E2E testing found.

## Auditability & PII
- `audit_events` is append-only (no update/delete path in the domain layer) and captures
  actor, action, and entity, with a correlation id (`x-request-id`) on every request.
- Structured logs are PII-aware: `createLogger`'s pino `redact` config strips
  `password`/`passwordHash`/`ssn`/`borrowerSsn`/`apiKey`/`hashedKey` fields and the raw
  `Authorization` header at any nesting depth. This config existed before Phase 13 but had
  never actually been exercised by a test; `packages/shared-config/src/logger.test.ts`
  (new in Phase 13) captures real emitted JSON and asserts on it.
- mTLS for service-to-service calls in production (e.g. worker → a future real vendor SOAP
  endpoint) remains architected-for but not built — deferred, see below.

## What's explicitly deferred
Real HSM/KMS key management, a live WAF, a real malware-scanning engine, API-key
authentication for the developer/API area, server-side refresh-token revocation, and a
CI secret-scan step are out of scope for this build and tracked as production hardening
items (docs/REQUIREMENTS_MATRIX.md #31/#38, docs/DEPLOYMENT.md's launch checklist) —
building fake versions of these would be worse than naming the gap.
