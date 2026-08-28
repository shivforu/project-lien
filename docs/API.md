# API (draft — finalized in Phase 8)

Versioned REST under `/api/v1`. Full OpenAPI spec will live at
`apps/api/openapi.yaml` once the controllers exist; this file tracks the intended surface
so later phases have a fixed target and don't silently rename things.

## Conventions
- Auth: `Authorization: Bearer <jwt|api_key>`.
- Every response includes `requestId`.
- Mutating endpoints accept an optional `Idempotency-Key` header; replaying the same key
  returns the original result instead of re-executing (see docs/TEST_STRATEGY.md,
  scenario F).
- Errors use one envelope: `{ "error": { "code": "...", "message": "...", "details": [...] } }`.
- List endpoints are cursor-paginated: `?cursor=...&limit=...` →
  `{ "data": [...], "nextCursor": "..." }`.
- Rate limits communicated via `X-RateLimit-Limit` / `X-RateLimit-Remaining` /
  `X-RateLimit-Reset`.

## Endpoints (target)
```
POST   /api/v1/releases
GET    /api/v1/releases/:id
GET    /api/v1/releases
POST   /api/v1/releases/:id/preflight
POST   /api/v1/releases/:id/submit
POST   /api/v1/releases/:id/resubmit
POST   /api/v1/releases/:id/cancel
GET    /api/v1/releases/:id/status
GET    /api/v1/releases/:id/events
GET    /api/v1/jurisdictions/:fips
GET    /api/v1/jurisdictions/states/:stateCode
POST   /api/v1/fees/calculate
POST   /api/v1/payoffs/calculate
POST   /api/v1/payoffs/reconcile
GET    /api/v1/compliance/at-risk
GET    /api/v1/exceptions
POST   /api/v1/exceptions/:id/resolve
GET    /api/v1/webhooks/endpoints
POST   /api/v1/webhooks/endpoints
GET    /api/v1/webhooks/deliveries
POST   /api/v1/webhooks/deliveries/:id/redeliver
GET    /api/v1/audit-events
GET    /health
GET    /ready
```

## Webhook events (outbound)
`recording.created`, `recording.preflight_failed`, `recording.submitted`,
`recording.rejected`, `recording.recorded`, `recording.completed`, `fee.adjusted`,
`deadline.at_risk`.
