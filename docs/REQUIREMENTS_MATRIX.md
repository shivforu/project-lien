# Requirements Traceability Matrix

Source area page references are to Requirements.pdf (123-page transcript export).
Status values: `NOT_STARTED`, `IN_PROGRESS`, `DONE` (built + tested), `MOCKED` (interface
+ mock only, by design — see EXTERNAL_DEPENDENCIES.md), `DEFERRED` (explicitly out of v1
scope, see ASSUMPTIONS.md / DECISIONS.md).

| # | Requirement | Source area | Module | Implementation | Test | Status |
|---|---|---|---|---|---|---|
| 1 | State jurisdiction rules (theory type, doc type, deadline, penalty, margins, notary type) | pp.37–39, 85–88 (Module 1 + `000_init_all.sql`) | domain-jurisdiction | `packages/domain-jurisdiction` | unit: rule resolution (`resolver.test.ts`, 8 tests) | DONE |
| 2 | County/FIPS overrides & fee schedule | pp.50–52 (Module 1 extension) | domain-jurisdiction + domain-fees | `resolveJurisdictionRule` (county overrides state) | unit: override + fallback (`resolver.test.ts`) | DONE |
| 3 | Rule versioning / verification metadata (source, effectiveDate, verifiedAt, verifiedBy, status) | project instructions (not in transcript — transcript never modeled this) | domain-jurisdiction | `rule_versions` table (schema only — no read/write logic yet) | unit | IN_PROGRESS |
| 4 | Recording fee engine | pp.51–52 | domain-fees | `calculateRecordingFee` | unit: base/per-page/cover-page (`calculator.test.ts`, 8 tests) | DONE |
| 5 | Dynamic statutory document generation | pp.47–48 (pdf-lib) superseded by D4 (Handlebars+Playwright) | domain-documents | `renderDocumentHtml` + `renderHtmlToPdf` | unit + real-browser render (`templating.test.ts`, `pdf/renderer.test.ts`) | DONE |
| 6 | PDF margin/stamp-zone normalization | pp.42–44, corrected pp.60–61 | domain-documents | `checkMarginCompliance`/`padTopMargin` (pdf-lib) | unit: geometry incl. yOffset clamp (`pdf/margins.test.ts`, 4 tests) | DONE |
| 7 | Pre-flight validation (deterministic) | pp.44–46 (partially; vision heuristics excluded per D5) | domain-documents | `runPreflight` | unit (`preflight.test.ts`, 6 tests) | DONE |
| 8 | Signature/notary-seal vision validation | pp.44–46 (toy heuristic, not reused) | domain-documents | `ISignatureVisionProvider` + mock | unit (mock) | MOCKED |
| 9 | PRIA canonical package + XML builder | pp.53–56, 96–98 | domain-pria | `serializePriaPackageToXml` | unit (`serializer.test.ts`, 4 tests) | DONE |
| 10 | PRIA/XSD validation | pp.56–57 | domain-pria | `validatePriaXml` (structural, not real XSD) | unit (positive/negative, `serializer.test.ts`) | DONE |
| 11 | eRecording provider interface | pp.62 (`IErecordingAdapter`) | adapters-erecording | `IErecordingProvider` | contract tests (`runProviderContractTests`) | DONE |
| 12 | Simplifile adapter | pp.63–64, fix pp.68–69 | adapters-erecording | mock adapter | contract tests (`adapters.test.ts`) | MOCKED |
| 13 | CSC adapter | pp.64–67 | adapters-erecording | mock adapter | contract tests (`adapters.test.ts`) | MOCKED |
| 14 | ePN adapter | pp.69–70 | adapters-erecording | mock adapter | contract tests (`adapters.test.ts`) | MOCKED |
| 15 | Vendor/county routing | pp.67–68 | adapters-erecording | `ErecordingProviderRouter` | unit (`adapters.test.ts`) | DONE |
| 16 | Direct-to-county adapters | p.30 (aspirational, never built) | adapters-erecording | interface only (router throws for MANUAL/DIRECT_COUNTY) | n/a | DEFERRED |
| 17 | Escrow ledger (double-entry) | pp.71–74 | domain-escrow | `depositPayoff`/`holdRecordingFee`/`remitRecordingFee` | unit + integration, real `.forUpdate()` row locking (`ledger.test.ts`, 4 tests) | DONE |
| 18 | Fee reconciliation/refund/shortage | pp.72–74 | domain-escrow | `remitRecordingFee` variance handling (BALANCED/REFUND_QUEUED/DEFICIT_COVERED) | unit + integration (`ledger.test.ts`) | DONE |
| 19 | Statutory deadline & penalty monitoring | pp.74–76, fix pp.94–95 | domain-escrow / worker | `checkDeadlinesForBatch` + self-rescheduling `statutory-deadline-scan` job | unit + integration (`deadline-monitor.test.ts` 4 tests, `statutory-deadline-scan.test.ts` 1 test) | DONE |
| 20 | Package state machine | described loosely throughout; normalized in ARCHITECTURE.md | domain-workflow | `FORWARD_TRANSITIONS`/`assertTransition` (all 17 states) | unit: all transitions (`state-machine.test.ts`, 7 tests) | DONE |
| 21 | Workflow orchestration (retry/backoff/dead-letter/idempotency/restart-recovery) | p.31 aspirational (Temporal/Kafka) vs. p.76–83 actual (bare `setInterval`, gap identified in DECISIONS D3) | domain-workflow + apps/worker | DB-backed job queue (`FOR UPDATE SKIP LOCKED`) | integration: idempotency, concurrent-claim safety, backoff→dead-letter, restart-recovery (`job-queue.test.ts`, 5 tests, incl. scenario J) | DONE |
| 22 | Webhook processing (in: county/vendor; out: customer) | p.30 (event names), never implemented in transcript code | apps/api + apps/worker | outbound webhook dispatcher (HMAC-signed) | integration: scenario E (`webhook-delivery.test.ts`, real `node:http` server) | IN_PROGRESS (outbound customer webhooks DONE; no inbound county/vendor webhook receiver built — vendor status is polled, not pushed, matching the mock adapters' `pollStatus` design) |
| 23 | Rejection & resubmission workflow | pp.68 (UI concept), p.94 gaps | domain-workflow + apps/api + apps/web | `REJECTED`→`RESUBMISSION_REQUIRED`→`VALIDATING` transition + exception center | unit (`state-machine.test.ts`) + real E2E (browser-driven resolve, verified against Postgres) | DONE |
| 24 | Audit/event history (immutable) | p.50–51 (`package_audit_ledger`) | domain-workflow | `recordAuditEvent` / `audit_events` table | unit (`audit-log.test.ts`, 2 tests) + integration via `/api/v1/audit-events` | DONE |
| 25 | Title/Escrow operations UI | pp.18–25 (dashboard, disconnected from backend — D-noted contradiction) | apps/web | Next.js app: login/queue/detail/exceptions/integrations/jurisdictions, all wired to the real API | E2E (Playwright, real browser against real running processes) | IN_PROGRESS (every built screen is real and tested; no metrics-tile dashboard home page yet — see `app/page.tsx`) |
| 26 | Operational queues/dashboards | pp.18–23 | apps/web | queue list + detail screens | E2E (Playwright) | IN_PROGRESS (queue screen DONE; no cross-org metrics dashboard) |
| 27 | Exception center | pp.23–25 | apps/web | `/exceptions` screen + resolve action | E2E scenario C (real browser click → real Postgres transition, verified) | DONE |
| 28 | Document viewer w/ pre-flight overlay | project instructions (not in transcript) | apps/web | viewer component | manual + E2E smoke | NOT_STARTED |
| 29 | Jurisdiction/rules admin UI | project instructions (not in transcript) | apps/web | `/jurisdictions` screen | E2E smoke | IN_PROGRESS (read-only lookup screen exists; no create/edit admin UI) |
| 30 | Integrations/connector health UI | project instructions | apps/web | `/integrations` screen | E2E smoke (real browser, real seeded rows) | DONE |
| 31 | Developer/API area (keys, webhooks, docs) | pp.30–31 (mentions APIs generally) | apps/web + apps/api | dev portal | E2E smoke | NOT_STARTED (webhook CRUD exists at the API level via `/api/v1/webhooks`; no dedicated web UI for API keys/webhooks/docs browsing) |
| 32 | Versioned REST API + OpenAPI | pp.79–81 (`/api/v1/releases/*`), formalized in docs/API.md | apps/api | Express routers + `openapi.json` | integration (`routes.test.ts`, `app.test.ts`) | DONE |
| 33 | Auth/RBAC/tenant isolation | p.8 (Auth0/Okta mention only) | apps/api | local JWT auth + `requireAuth`/`requireRole`, org-scoped queries | integration (`routes.test.ts` — login, 403 role checks, tenant scoping) | DONE |
| 34 | LOS/TMS connector architecture | pp.29–30 (named vendors, no specs) | adapters-los | `ILosConnector` + `GenericMockLosConnector` | contract tests (`contract-tests.ts` via `mock-connector.test.ts`, 6 tests) | MOCKED |
| 35 | Document storage abstraction | p.8 (S3+KMS mention) | adapters-storage | `IDocumentStorage` + `LocalFsDocumentStorage` (real filesystem I/O; MinIO/S3 is a config swap per D12) | integration (`local-fs-storage.test.ts`, 7 tests, real disk read/write/delete) | DONE |
| 36 | Observability (logs, correlation ids, health/ready) | pp.89–90 (`/health` only) | shared-config + apps | pino logging, `/health`, `/ready`, `x-request-id` correlation header | manual + integration | IN_PROGRESS (structured logging + health/ready + correlation ids all real and verified; no log aggregation/metrics/tracing — tracked for Phase 13) |
| 37 | Docker local environment | pp.90–93, hardened pp.101–102 | infra | 3 Dockerfiles + docker-compose.yml (postgres, minio, migrate, api, worker, web) | written and code-reviewed; not run under a real Docker daemon in this build sandbox (none available — see docs/LOCAL_DEVELOPMENT.md); the same code paths were verified by running the compiled binaries directly against a native Postgres | DONE (unverified under Docker itself — ask the user to confirm `docker compose up -d` on their machine) |
| 38 | CI/CD-ready structure | not in transcript | infra/ci | GitHub Actions workflows | CI run | NOT_STARTED (tracked for Phase 14) |
| 39 | 50-state seed data | pp.39–40, 87–88 | db seed | `packages/db/src/seed.ts`, every row `status=UNVERIFIED`, `source='requirements_pdf_transcript'` | verified live: seeded into local Postgres, queried via psql, confirmed 50/50 states + provenance columns correct | DONE (data seeded; legal re-verification of any individual state is future work, tracked here) |
| 40 | Currency-safe ledger math (no floats) | project instructions (transcript used `NUMERIC` in SQL but floats in JS via `parseFloat`, a real bug carried through every module) | domain-escrow + domain-fees | integer-cents arithmetic throughout (`InvalidFeeInputError` rejects non-integer amounts) | unit (`calculator.test.ts`, `ledger.test.ts`) | DONE |

This table is updated at the end of every phase in PROGRESS.md's phase report and here
in the same commit — a requirement is never marked DONE without a passing test named in
the Test column.
