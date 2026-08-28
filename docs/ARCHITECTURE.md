# Architecture

## System boundaries

In scope: everything from "a payoff has occurred and a lien release is owed" through
"the recorded document and reconciled fees are archived and delivered." That includes
jurisdiction/compliance resolution, document generation and pre-flight, PRIA packaging,
vendor/county dispatch, status tracking, escrow/fee reconciliation, statutory deadline
monitoring, the operations UI, and the public API/webhooks.

Out of scope for this build: the payoff *calculation* itself as a servicing/core-banking
function (we accept a payoff/loan record as input — we don't compute per-diem interest
against a live loan servicing ledger), real bank wire movement, real notary sessions, and
real vendor submissions. Those integration points are built as interfaces with sandbox
mocks (see docs/EXTERNAL_DEPENDENCIES.md).

## Lifecycle (the state machine)

```
DRAFT → VALIDATING → (PREFLIGHT_FAILED | READY)
READY → PENDING_SIGNATURE → PENDING_NOTARY → READY_TO_SUBMIT
READY_TO_SUBMIT → SUBMITTING → SUBMITTED → COUNTY_PROCESSING
COUNTY_PROCESSING → (REJECTED | RECORDED)
REJECTED → RESUBMISSION_REQUIRED → VALIDATING   (loop back)
RECORDED → RECONCILING → COMPLETE
any non-terminal state → CANCELLED (operator action)
any state → FAILED (unrecoverable system error, requires operator intervention)
```

This is the normalized version of the states scattered across Requirements.pdf (which
used a shorter/inconsistent set at different points, e.g. `SUBMITTED_TO_COUNTY` vs.
`COUNTY_PROCESSING`). Every transition is a row in `workflow_events`, written in the same
transaction as the state change, so the audit trail can never drift from the actual state.

## High-level components

```
                         ┌─────────────────────────────┐
                         │   apps/web (Next.js)         │  operator UI, developer portal
                         └───────────────┬─────────────┘
                                         │ REST (versioned, OpenAPI)
                         ┌───────────────▼─────────────┐
                         │   apps/api (Express/Fastify)  │  auth, REST, webhooks out
                         └───────────────┬─────────────┘
                                         │ enqueues jobs / reads state
                         ┌───────────────▼─────────────┐
                         │   apps/worker                │  workflow engine, polling,
                         │                               │  retries, statutory scheduler
                         └───────────────┬─────────────┘
             ┌─────────────┬─────────────┼─────────────┬───────────────┐
             ▼             ▼             ▼             ▼               ▼
    domain-jurisdiction  domain-documents domain-pria  domain-escrow  adapters-erecording
    (state/county rules) (gen + preflight)(pkg + xsd)  (ledger)       (Simplifile/CSC/ePN
                                                                        mocks, router)
             │             │             │             │               │
             └─────────────┴──────┬──────┴─────────────┴───────────────┘
                                  ▼
                          PostgreSQL 16 (Prisma)      MinIO (document storage)
```

`apps/api` never talks to vendor adapters or does long-running work directly — it writes
a package/job row and returns; `apps/worker` is the only thing that advances the state
machine, so a slow county-network call or a Puppeteer render never blocks an HTTP request,
and a worker crash mid-job is recoverable (the job row is still there, claimable by the
next worker poll).

## Data flow: successful recording (happy path)

1. `POST /api/v1/releases` — API validates payload, resolves loan/property, creates a
   `recording_packages` row in `DRAFT`, enqueues a `VALIDATE` job.
2. Worker: resolves state + county rule (`domain-jurisdiction`), selects doc type,
   generates the document (`domain-documents`), runs deterministic + vision pre-flight,
   transitions to `READY` or `PREFLIGHT_FAILED`.
3. Operator (or automated rule) marks the package `PENDING_SIGNATURE` /
   `PENDING_NOTARY` once execution is complete (notary integration is a mocked adapter
   for v1 — see EXTERNAL_DEPENDENCIES.md).
4. Worker: builds the PRIA package (`domain-pria`), validates it, computes fee estimate
   (`domain-fees`), routes to a vendor adapter (`adapters-erecording`), submits, records
   the vendor tracking id, moves to `SUBMITTED` → `COUNTY_PROCESSING`.
5. Worker (polling job, on an interval) or an inbound webhook updates status; on
   acceptance, moves to `RECORDED`, stores the recorded book/page/instrument number and
   the recorded copy.
6. Worker: reconciles actual vs. estimated fee (`domain-escrow`) — refund, shortage-cover,
   or balanced — moves to `RECONCILING` → `COMPLETE`.
7. Every step appends to `workflow_events` and `audit_events`; webhooks fire on each
   customer-relevant transition.

Rejection, resubmission, vendor outage/retry, duplicate webhook, duplicate submission,
deadline warning, fee overage/shortage, and restart-mid-workflow are all handled by the
same state machine plus the job table's idempotency key and retry/backoff columns — see
docs/TEST_STRATEGY.md for how each is exercised as an E2E scenario.

## Frontend architecture

Next.js App Router, server components for data-heavy screens (queue, package detail,
audit history), client components for interactive pieces (wizard, exception resolution,
document viewer overlays). Screens: login, dashboard, recording queue, new
recording/release wizard, package detail, exception center, document viewer, jurisdiction
rules admin, integrations, audit history, developer/API area. One design system
(Tailwind + a small shared component set), B2B-financial-operations visual style:
information-dense tables, status badges, minimal decoration.

## Integration architecture

- **eRecording vendors**: `IErecordingProvider` behind `adapters-erecording`, router
  picks an adapter per county's configured network, falls back to `MANUAL` when no
  network is configured or all adapters are unhealthy.
- **LOS/TMS**: inbound connector interface (`adapters-los`) with a generic "push a
  release request" mapping layer; Encompass/Qualia/SoftPro/RamQuest get named but mocked
  implementations until real specs/credentials exist.
- **Webhooks (outbound)**: signed (HMAC), retried with backoff, delivery logged.
- **Notary**: `INotaryProvider` interface, mock implementation (no real Notarize/Proof
  integration — no credentials available).

## Security architecture

See docs/SECURITY.md.

## Testing strategy

See docs/TEST_STRATEGY.md.

## Infrastructure / deployment

Local: `docker-compose.yml` — Postgres, MinIO, api, worker, web. Migrations run via
Prisma on container start. Production target: any container platform (ECS/Fly/Render/
k8s) — see docs/DEPLOYMENT.md for the environment variable swap points (S3 vs MinIO,
managed Postgres, real vendor credentials, real IdP).
