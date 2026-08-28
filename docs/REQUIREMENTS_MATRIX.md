# Requirements Traceability Matrix

Source area page references are to Requirements.pdf (123-page transcript export).
Status values: `NOT_STARTED`, `IN_PROGRESS`, `DONE` (built + tested), `MOCKED` (interface
+ mock only, by design — see EXTERNAL_DEPENDENCIES.md), `DEFERRED` (explicitly out of v1
scope, see ASSUMPTIONS.md / DECISIONS.md).

| # | Requirement | Source area | Module | Implementation | Test | Status |
|---|---|---|---|---|---|---|
| 1 | State jurisdiction rules (theory type, doc type, deadline, penalty, margins, notary type) | pp.37–39, 85–88 (Module 1 + `000_init_all.sql`) | domain-jurisdiction | `packages/domain-jurisdiction` | unit: rule resolution | NOT_STARTED |
| 2 | County/FIPS overrides & fee schedule | pp.50–52 (Module 1 extension) | domain-jurisdiction + domain-fees | `CountyComplianceEngine` equivalent | unit: override + fallback | NOT_STARTED |
| 3 | Rule versioning / verification metadata (source, effectiveDate, verifiedAt, verifiedBy, status) | project instructions (not in transcript — transcript never modeled this) | domain-jurisdiction | `rule_versions` table | unit | NOT_STARTED |
| 4 | Recording fee engine | pp.51–52 | domain-fees | fee calculator | unit: base/per-page/cover-page | NOT_STARTED |
| 5 | Dynamic statutory document generation | pp.47–48 (pdf-lib) superseded by D4 (Handlebars+Puppeteer) | domain-documents | template engine | unit + snapshot | NOT_STARTED |
| 6 | PDF margin/stamp-zone normalization | pp.42–44, corrected pp.60–61 | domain-documents | margin transformer (pdf-lib) | unit: geometry incl. yOffset clamp | NOT_STARTED |
| 7 | Pre-flight validation (deterministic) | pp.44–46 (partially; vision heuristics excluded per D5) | domain-documents | preflight rule engine | unit | NOT_STARTED |
| 8 | Signature/notary-seal vision validation | pp.44–46 (toy heuristic, not reused) | domain-documents | `ISignatureVisionProvider` + mock | unit (mock) | MOCKED |
| 9 | PRIA canonical package + XML builder | pp.53–56, 96–98 | domain-pria | package model + serializer | unit | NOT_STARTED |
| 10 | PRIA/XSD validation | pp.56–57 | domain-pria | structural validator | unit (positive/negative) | NOT_STARTED |
| 11 | eRecording provider interface | pp.62 (`IErecordingAdapter`) | adapters-erecording | `IErecordingProvider` | contract tests | NOT_STARTED |
| 12 | Simplifile adapter | pp.63–64, fix pp.68–69 | adapters-erecording | mock adapter | contract tests | MOCKED |
| 13 | CSC adapter | pp.64–67 | adapters-erecording | mock adapter | contract tests | MOCKED |
| 14 | ePN adapter | pp.69–70 | adapters-erecording | mock adapter | contract tests | MOCKED |
| 15 | Vendor/county routing | pp.67–68 | adapters-erecording | router | unit | NOT_STARTED |
| 16 | Direct-to-county adapters | p.30 (aspirational, never built) | adapters-erecording | interface only | n/a | DEFERRED |
| 17 | Escrow ledger (double-entry) | pp.71–74 | domain-escrow | ledger service | unit + integration (tx isolation) | NOT_STARTED |
| 18 | Fee reconciliation/refund/shortage | pp.72–74 | domain-escrow | reconciliation service | unit + integration | NOT_STARTED |
| 19 | Statutory deadline & penalty monitoring | pp.74–76, fix pp.94–95 | domain-escrow / worker | scheduler job | unit + E2E scenario G | NOT_STARTED |
| 20 | Package state machine | described loosely throughout; normalized in ARCHITECTURE.md | domain-workflow | state machine | unit: all transitions | NOT_STARTED |
| 21 | Workflow orchestration (retry/backoff/dead-letter/idempotency/restart-recovery) | p.31 aspirational (Temporal/Kafka) vs. p.76–83 actual (bare `setInterval`, gap identified in DECISIONS D3) | domain-workflow + apps/worker | DB-backed job queue | integration: E2E scenarios D, F, J | NOT_STARTED |
| 22 | Webhook processing (in: county/vendor; out: customer) | p.30 (event names), never implemented in transcript code | apps/api + apps/worker | webhook dispatcher/receiver | integration: E2E scenario E | NOT_STARTED |
| 23 | Rejection & resubmission workflow | pp.68 (UI concept), p.94 gaps | domain-workflow | resubmission transition + exception center UI | E2E scenario C | NOT_STARTED |
| 24 | Audit/event history (immutable) | p.50–51 (`package_audit_ledger`) | shared | `audit_events` table | integration | NOT_STARTED |
| 25 | Title/Escrow operations UI | pp.18–25 (dashboard, disconnected from backend — D-noted contradiction) | apps/web | Next.js app | E2E (Playwright) | NOT_STARTED |
| 26 | Operational queues/dashboards | pp.18–23 | apps/web | dashboard + queue screens | E2E | NOT_STARTED |
| 27 | Exception center | pp.23–25 | apps/web | exception center screen | E2E scenario C | NOT_STARTED |
| 28 | Document viewer w/ pre-flight overlay | project instructions (not in transcript) | apps/web | viewer component | manual + E2E smoke | NOT_STARTED |
| 29 | Jurisdiction/rules admin UI | project instructions (not in transcript) | apps/web | admin screens | E2E smoke | NOT_STARTED |
| 30 | Integrations/connector health UI | project instructions | apps/web | integrations screen | E2E smoke | NOT_STARTED |
| 31 | Developer/API area (keys, webhooks, docs) | pp.30–31 (mentions APIs generally) | apps/web + apps/api | dev portal | E2E smoke | NOT_STARTED |
| 32 | Versioned REST API + OpenAPI | pp.79–81 (`/api/v1/releases/*`), formalized in docs/API.md | apps/api | controllers + OpenAPI spec | integration | NOT_STARTED |
| 33 | Auth/RBAC/tenant isolation | p.8 (Auth0/Okta mention only) | apps/api | local JWT auth + RBAC | integration | NOT_STARTED |
| 34 | LOS/TMS connector architecture | pp.29–30 (named vendors, no specs) | adapters-los | interface + 1 mock connector | contract test | MOCKED |
| 35 | Document storage abstraction | p.8 (S3+KMS mention) | adapters-storage | `IDocumentStorage` (MinIO/S3) | integration | NOT_STARTED |
| 36 | Observability (logs, correlation ids, health/ready) | pp.89–90 (`/health` only) | shared-config + apps | pino logging, `/health`, `/ready` | manual + integration | NOT_STARTED |
| 37 | Docker local environment | pp.90–93, hardened pp.101–102 | infra | Dockerfile(s) + docker-compose.yml | manual verification (no daemon in build sandbox — see LOCAL_DEVELOPMENT.md) | IN_PROGRESS |
| 38 | CI/CD-ready structure | not in transcript | infra/ci | GitHub Actions workflows | CI run | NOT_STARTED |
| 39 | 50-state seed data | pp.39–40, 87–88 | db seed | Prisma seed, `status=UNVERIFIED` throughout | n/a (data, not logic) | NOT_STARTED |
| 40 | Currency-safe ledger math (no floats) | project instructions (transcript used `NUMERIC` in SQL but floats in JS via `parseFloat`, a real bug carried through every module) | domain-escrow | integer-cents arithmetic | unit | NOT_STARTED |

This table is updated at the end of every phase in PROGRESS.md's phase report and here
in the same commit — a requirement is never marked DONE without a passing test named in
the Test column.
