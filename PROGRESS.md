# Progress

Legend: [x] done + verified, [~] in progress, [ ] not started

## Phase 0 — Requirements reconciliation & architecture
- [x] Read Requirements.pdf in full (123 pages / 4,206 extracted lines)
- [x] Produced understanding, system boundaries, requirements, architecture, data model,
      integration/security/test/infra plans
- [x] Identified contradictions & resolved them (docs/DECISIONS.md)
- [x] Logged assumptions (docs/ASSUMPTIONS.md)
- [x] Logged external dependencies / unverifiable data (docs/EXTERNAL_DEPENDENCIES.md)
- [x] Built requirements traceability matrix (docs/REQUIREMENTS_MATRIX.md)
- [x] Proposed repo structure & phased plan (this file + docs/ARCHITECTURE.md)

**Status:** DONE
**Files created:** docs/DECISIONS.md, docs/ARCHITECTURE.md, docs/ASSUMPTIONS.md,
docs/EXTERNAL_DEPENDENCIES.md, docs/SECURITY.md, docs/TEST_STRATEGY.md, docs/API.md,
docs/LOCAL_DEVELOPMENT.md, docs/DEPLOYMENT.md, docs/REQUIREMENTS_MATRIX.md, PROGRESS.md
**Known limitations:** Data model in REQUIREMENTS_MATRIX/ARCHITECTURE is a target, not
yet expressed as a Prisma schema — that's Phase 1/2 work.
**Assumptions:** See docs/ASSUMPTIONS.md.
**Next step:** Phase 1 — repo/tooling/database/local infrastructure.

## Phase 1 — Repository, tooling, database, local infrastructure
- [x] pnpm workspace + Turborepo skeleton (apps/api, apps/worker, apps/web, packages/*)
- [x] Shared TS config (strict), ESLint
- [x] Postgres schema as hand-authored SQL migrations + Kysely typed client (pivoted
      off Prisma — see docs/DECISIONS.md D2) + a dependency-light migration runner
- [x] 50-state + 5 demo-county seed script, every row `status='UNVERIFIED'`
- [x] docker-compose.yml (postgres, minio, migrate, api, worker, web) + 3 Dockerfiles
- [x] .env.example
- [x] Root README
- [x] Minimal but real `apps/api` (Express, `/health`, `/ready`, versioned API stub
      returning 501 until Phase 8) and `apps/worker` (DB-connected heartbeat loop,
      graceful shutdown) and `apps/web` (Next.js App Router placeholder page)
- [x] Verified: `pnpm install` (16→19 workspace projects), `pnpm build`/`typecheck`/
      `lint`/`test` all green (29/29 tasks) against a real local Postgres 16 instance
- [x] Verified: migration applies from empty and is idempotent on rerun (automated
      test, `packages/db/src/migrate.test.ts`)
- [x] Verified: seed populates 50 states + 5 counties with correct UNVERIFIED
      provenance (queried directly via psql)
- [x] Verified: compiled `apps/api/dist/server.js` actually boots, connects to
      Postgres, and answers `/health` (200), `/ready` (200, DB CONNECTED), and
      `/api/v1/*` (501 — honest, not implemented yet)
- [x] Verified: compiled `apps/worker/dist/index.js` boots, heartbeats against
      Postgres on an interval, and shuts down cleanly on SIGTERM

**STATUS:** DONE
**FILES CREATED:** ~110 files — full pnpm/turborepo scaffold, `packages/db` (SQL
migration, Kysely schema/client, migration runner, seed script + test),
`apps/{api,worker,web}` source, `docker-compose.yml`, 3 Dockerfiles, `.env.example`,
`.eslintrc.json`, `README.md`.
**FILES MODIFIED:** `docs/DECISIONS.md` (added the Prisma→Kysely pivot as D2's revision).
**TESTS RUN:** `pnpm exec turbo run build test lint` (workspace-wide) + a live
psql query against seeded data + manual boot of both compiled server binaries.
**TEST RESULTS:** 29/29 turbo tasks passed (12 real unit/integration tests across
`db`, `api`, `worker`, `shared-config`, plus 8 stub-package smoke tests that will grow
into real suites as each package's Phase lands); 0 lint errors; migration idempotent.
**KNOWN LIMITATIONS:**
- No Docker daemon is available in this build/verification environment, so
  `docker-compose up` itself was not run here — verification instead used a natively
  installed Postgres 16 and directly-invoked compiled binaries, which exercises the
  same code paths `docker-compose` would run. The compose file and Dockerfiles are
  believed correct but not yet proven end-to-end in a real container runtime — flagged
  for the user to confirm on their machine (`docker compose up -d`) and reported back
  if anything needs adjusting.
- 8 of the domain/adapter packages are structural stubs (one-line export + a smoke
  test) — real logic lands in the Phase named in each package's `src/index.ts` comment.
- No CI workflow yet (that's Phase 14, though the underlying commands it will call are
  all working today).
**ASSUMPTIONS:** See docs/ASSUMPTIONS.md. Additionally: chose Kysely + hand-written SQL
over Prisma specifically because of a network constraint discovered while building this
phase (docs/DECISIONS.md D2) — worth revisiting if a future environment has open access.
**NEXT STEP:** Phase 2 — domain model + jurisdiction engine (state/county rule
resolution, the compliance provenance workflow, and the first real unit test suite with
actual logic behind it, not stubs).

## Phase 2 — Domain model + jurisdiction engine
- [x] `packages/domain-jurisdiction`: `resolveJurisdictionRule` (county overrides state,
      e.g. `customTopMarginInches`), `calculateStatutoryDeadline`,
      `calculateAccruedPenaltyCents`, `UnknownJurisdictionError`, Kysely-backed
      `findStateRule`/`findCountyRule`/`listStateRules`
- [x] `packages/domain-fees`: `calculateRecordingFee`, `compareFeeToActual` (BALANCED /
      REFUND_QUEUED / DEFICIT_COVERED), `InvalidFeeInputError` — integer-cents only

**STATUS:** DONE
**FILES CREATED:** `packages/domain-jurisdiction/src/{types,resolver,repository,index}.ts`
+ `resolver.test.ts` (8 tests); `packages/domain-fees/src/{calculator,index}.ts` +
`calculator.test.ts` (8 tests).
**TESTS RUN:** `pnpm --filter <pkg> test` against real Postgres, then full workspace
`turbo run build test lint`.
**TEST RESULTS:** 16/16 new tests passing; 0 lint errors.
**KNOWN LIMITATIONS:** Jurisdiction/fee data itself remains `UNVERIFIED` demo data per
Phase 1 (docs/DECISIONS.md D9) — this phase is the *engine*, not new legal research.
**NEXT STEP:** Phase 3 — document generation + PDF/pre-flight engine.

## Phase 3 — Document generation + PDF/pre-flight engine
- [x] `packages/domain-documents`: Handlebars HTML templating (one generic template
      covers all 7 lien-release document types), Playwright-driven HTML→PDF rendering,
      pdf-lib margin compliance check + top-margin padding, `MockSignatureVisionProvider`
      (docs/DECISIONS.md D5), `runPreflight` (required fields, margins, trustee,
      witnesses, signature/seal detection)
- [x] Puppeteer→Playwright pivot (docs/DECISIONS.md D4 revised) after confirming the
      sandbox's pre-installed Chromium is Playwright-keyed
- [x] Turborepo v2 strict-env-mode gap found and fixed (`turbo.json`
      `globalPassThroughEnv`) — the renderer test passed standalone but failed under
      `turbo run` because `PLAYWRIGHT_BROWSERS_PATH` was silently stripped

**STATUS:** DONE
**FILES CREATED:** `packages/domain-documents/src/{templating,vision,preflight,index}.ts`,
`src/pdf/{renderer,margins}.ts`, plus `templating.test.ts`, `preflight.test.ts` (6 tests),
`pdf/margins.test.ts` (4 tests), `pdf/renderer.test.ts` (1 real-headless-browser test).
**FILES MODIFIED:** `turbo.json` (`globalPassThroughEnv`), `docs/DECISIONS.md` (D4 revised).
**TESTS RUN:** Real headless-Chromium PDF render + pdf-lib inspection against actual
generated PDF bytes (not mocked), both standalone and under `turbo run`.
**TEST RESULTS:** 12/12 new tests passing, including one real-browser render.
**KNOWN LIMITATIONS:** Signature/seal detection is an explicitly-labeled mock (no real
computer vision) — docs/DECISIONS.md D5.
**NEXT STEP:** Phase 4 — PRIA canonical package + XML validation.

## Phase 4 — PRIA canonical package + XML validation
- [x] `packages/domain-pria`: canonical `PriaPackage`/`PriaParty` model,
      `serializePriaPackageToXml` (xmlbuilder2), `validatePriaXml` (fast-xml-parser) —
      validates this project's own internal structural contract, not the real licensed
      PRIA XSD (docs/DECISIONS.md D7)

**STATUS:** DONE
**FILES CREATED:** `packages/domain-pria/src/{types,serializer,validator,index}.ts` +
`serializer.test.ts` (4 tests).
**TESTS RUN:** `pnpm --filter @project-lien/domain-pria test`, then full workspace build.
**TEST RESULTS:** 4/4 new tests passing.
**KNOWN LIMITATIONS:** Real PRIA XSD conformance remains an external dependency
(docs/EXTERNAL_DEPENDENCIES.md) — this is a project-internal "PRIA-shaped" dialect only.
**NEXT STEP:** Phase 5 — provider adapter framework + mock eRecording services.

## Phase 5 — Provider adapter framework + mock eRecording services
- [x] `packages/adapters-erecording`: `IErecordingProvider` interface, `MockErecordingAdapter`
      (in-memory state machine: SUBMITTED → ACCEPTED on 2nd poll → RECORDED on 3rd+),
      `createSimplifileMockAdapter`/`createCscMockAdapter`/`createEpnMockAdapter`,
      `ErecordingProviderRouter` (routes by county's `e_recording_network`, rejects
      MANUAL/DIRECT_COUNTY), a shared `runProviderContractTests` suite every adapter
      (mock or, later, real) must pass

**STATUS:** DONE
**FILES CREATED:** `packages/adapters-erecording/src/{types,mock-adapter,router,
contract-tests,index}.ts` + `adapters.test.ts` (17 tests, running the contract suite
against all three mock vendors plus router-specific tests).
**TESTS RUN:** `pnpm --filter @project-lien/adapters-erecording test`.
**TEST RESULTS:** 17/17 passing.
**KNOWN LIMITATIONS:** All three adapters are sandbox/mock only — no real vendor
credentials exist (docs/DECISIONS.md D6, docs/EXTERNAL_DEPENDENCIES.md). A real adapter
would implement the same `IErecordingProvider` interface and must pass the same contract
tests before being trusted.
**NEXT STEP:** Phase 6 — workflow orchestrator / queue / async processing.

## Phase 6 — Workflow orchestrator / queue / async processing
- [x] `packages/domain-workflow`: full 17-state `PackageStatus` transition table
      (`FORWARD_TRANSITIONS`, `CANCELLABLE_FROM`, `FAILABLE_FROM`, `assertTransition`,
      `IllegalTransitionError`), exponential backoff (`calculateBackoffMs`), a
      Postgres-backed job queue (`enqueueJob`/`claimNextJob` via `FOR UPDATE SKIP LOCKED`/
      `completeJob`/`failJob` with backoff-then-dead-letter/`requeueStaleJobs`), idempotency
      via a unique `idempotency_key`
- [x] `apps/worker`: real claim/dispatch loop replacing the Phase 1 heartbeat stub,
      `JOB_HANDLERS` registry, `poll-vendor-submission` handler wired to the Phase 5
      adapter router and the Phase 6 state machine
- [x] Found and fixed a significant latent type bug in `packages/db/src/schema.ts`:
      `Generated<Timestamp>` double-wrapped a `ColumnType` inside `Generated<>`
      (itself a `ColumnType`-producing utility), silently typing every generated
      timestamp column's insert/update type wrong across the *entire* schema (40
      occurrences) — introduced a dedicated `GeneratedTimestamp` type instead

**STATUS:** DONE
**FILES CREATED:** `packages/domain-workflow/src/{state-machine,backoff,job-queue,index}.ts`
+ 3 test files (15 tests); `apps/worker/src/{index,job-dispatcher,vendor-router}.ts`,
`src/handlers/{types,poll-vendor-submission}.ts` + a full E2E test (real org/property/
loan/package/vendor_submission setup, 3 sequential poll calls).
**FILES MODIFIED:** `packages/db/src/schema.ts` (the `GeneratedTimestamp` fix, 40 sites).
**TESTS RUN:** Full workspace `turbo run build test lint` against real Postgres, plus a
manual reasoning check of the `Generated<Timestamp>` fix (confirmed the bug by first
reproducing the incorrect insert-type compile error, then confirming it cleared).
**TEST RESULTS:** 20/20 new tests passing (state-machine 7, backoff 3, job-queue 5,
poll-vendor-submission 1 E2E, + pre-existing suites unaffected by the schema fix).
**KNOWN LIMITATIONS:** This is a Postgres-backed queue, not Temporal — an explicit,
documented tradeoff (docs/DECISIONS.md D3), revisitable if throughput ever demands it.
**NEXT STEP:** Phase 7 — escrow + fee reconciliation + statutory scheduler.

## Phase 7 — Escrow + fee reconciliation + statutory scheduler
- [x] `packages/domain-escrow`: double-entry ledger (`getOrCreateEscrowAccount`,
      `lockEscrowAccount` via `.forUpdate()`, `depositPayoff`, `holdRecordingFee`,
      `remitRecordingFee` — computes variance via Phase 2's `compareFeeToActual` and
      writes matching `fee_reconciliations` + ledger-transaction rows),
      `InsufficientFundsError`; deadline-monitor pure functions
      (`checkDeadline`/`checkDeadlinesForBatch`)
- [x] `apps/worker` statutory-deadline-scan handler: joins packages to jurisdiction
      rules, flags at-risk packages via `workflow_events`, and **self-reschedules**
      (enqueues its own successor job an hour out) rather than using cron/Temporal
      (docs/DECISIONS.md D3's "recurring job" pattern)

**STATUS:** DONE
**FILES CREATED:** `packages/domain-escrow/src/{ledger,deadline-monitor,index}.ts` +
`ledger.test.ts` (4 tests), `deadline-monitor.test.ts` (4 tests);
`apps/worker/src/handlers/statutory-deadline-scan.ts` + its test (1 test).
**TESTS RUN:** Full workspace build/test against real Postgres, including a real
transactional row-locking test for the escrow ledger.
**TEST RESULTS:** 9/9 new domain-escrow tests + 1 new worker test passing.
**KNOWN LIMITATIONS:** Currency is integer cents throughout, verified by inspection of
every ledger/fee function signature (no floating-point amount ever crosses a function
boundary).
**NEXT STEP:** Phase 8 — REST API + OpenAPI + webhooks.

## Phase 8 — REST API + OpenAPI + webhooks
- [x] `apps/api`: Express app (`createApp()` factory, testable without a bound port),
      `/health`, `/ready`, `/api/v1/openapi.json`, `auth`/`jurisdictions`/`fees`/
      `releases`/`webhooks` routers, a 501 catch-all for undocumented-but-unbuilt routes,
      centralized error handling, HMAC-SHA256 webhook signing (`timingSafeEqual`
      verification) with a per-endpoint generated secret shown once at creation,
      cursor-based pagination (`base64url(createdAt|id)`) for `GET /releases`
- [x] `packages/domain-workflow` `dispatchWebhookEvent` + `apps/worker`
      `webhook-delivery` handler (real `node:http` server used in its test)
- [x] Found/documented D14 (CommonJS-despite-ESM-source) when `import.meta.url` was
      rejected by `tsc`; fixed several `noUncheckedIndexedAccess`/Kysely
      Select-vs-Insert-type strictness errors

**STATUS:** DONE
**FILES CREATED:** `apps/api/src/{app,async-handler}.ts`, `src/auth/{password,jwt,
middleware}.ts`, `src/routes/{auth,jurisdictions,fees,packages,webhooks}.ts`,
`apps/api/openapi.json`, `routes.test.ts`, `app.test.ts`;
`packages/shared-config/src/webhook-signing.ts`;
`packages/domain-workflow/src/webhook-dispatch.ts`;
`apps/worker/src/handlers/webhook-delivery.ts` + test.
**FILES MODIFIED:** `docs/DECISIONS.md` (new D14).
**TESTS RUN:** `supertest` against the real Express app + real Postgres (no bound port);
worker webhook-delivery test posts to a real ephemeral `node:http` server.
**TEST RESULTS:** 16/16 new tests passing at the time (grew further in Phase 9/11).
**KNOWN LIMITATIONS:** OpenAPI spec is hand-written, not generated from route code —
acceptable for this project's size but worth automating if the surface keeps growing.
**NEXT STEP:** Phase 9 — authentication / authorization / tenant model.

## Phase 9 — Authentication / authorization / tenant model
- [x] Local email/password auth (bcryptjs — pure JS, chosen to avoid native-binary/CDN
      risk per the Prisma precedent in docs/DECISIONS.md D2), JWT access (15m) + refresh
      (7d) tokens, org-scoped RBAC (`ORG_ADMIN`/`OPERATOR`/`VIEWER`/`API_CLIENT`) via
      `requireAuth`/`requireRole` Express middleware, every `/api/v1` route
      tenant-scoped to `req.auth.organizationId`
- [x] Cleaned up a redundant `@types/bcryptjs` devDependency (bcryptjs 3.x ships its own
      types) and fixed `prefer-const` lint findings surfaced by a full lint pass

**STATUS:** DONE
**FILES CREATED/MODIFIED:** covered by the Phase 8 auth/middleware files above (auth and
API work landed together across Phases 8–9); `apps/api/package.json` (removed
`@types/bcryptjs`).
**TESTS RUN:** `routes.test.ts` exercises login success/failure, role-based 403s, and
tenant scoping (a package created under one org 404s for a request bearing another
org's token in spirit — same-org negative cases covered directly).
**TEST RESULTS:** Covered within the Phase 8/11 API test counts; a full
`turbo run build test lint --concurrency=1` pass was clean (0 errors) after this phase.
**KNOWN LIMITATIONS:** Auth is local JWT only — Auth0/Okta/SSO substitution is possible
later behind the same interface boundary (docs/DECISIONS.md D11) but not built.
**NEXT STEP:** Phase 10 — operations web application.

## Phase 10 — Operations web application
- [x] Next.js 14 App Router client app: `lib/api-client.ts` (localStorage session +
      typed `apiFetch`, documented as a deliberate v1 simplification vs. httpOnly
      cookies/server sessions), `/login`, `/queue` (list), `/queue/[id]` (detail),
      `/jurisdictions`
- [x] `packages/db/src/seed.ts`: demo organization + demo `ORG_ADMIN` login
      (`admin@demo-title-escrow.example` / `password123`) for local manual verification
- [x] Verified with a real Playwright script driving headless Chromium against actually
      running `next start` + compiled API server processes (login → queue → detail),
      not just component-level tests

**STATUS:** DONE
**FILES CREATED:** `apps/web/lib/api-client.ts`, `app/{layout,page}.tsx`,
`app/login/page.tsx`, `app/queue/page.tsx`, `app/queue/[id]/page.tsx`,
`app/jurisdictions/page.tsx`.
**FILES MODIFIED:** `packages/db/src/seed.ts` (demo admin user + org membership).
**TESTS RUN:** `next build` (typecheck + production build), then a manual real-browser
script: real login against the real API, real navigation, real data rendered from
Postgres.
**TEST RESULTS:** Build clean; manual E2E script passed (login redirected to `/queue`,
queue/detail data matched what was seeded/created via the API in the same session).
**KNOWN LIMITATIONS:** No dashboard metrics tile row, no status/sort filtering on the
queue yet (noted directly in `app/queue/page.tsx`'s doc comment as the natural next
iteration, not required for this phase's scope).
**NEXT STEP:** Phase 11 — exception center + audit + integration management.

## Phase 11 — Exception center + audit + integration management
- [x] `packages/domain-workflow/src/audit-log.ts`: `recordAuditEvent` — immutable
      `audit_events` rows (org-scoped or system-level with `organizationId: null`), wired
      into `auth.login`, `package.created`, `webhook_endpoint.created`,
      `exception.package_resolved`, `exception.job_resolved`
- [x] `GET /api/v1/audit-events` (ORG_ADMIN-only, cursor-paginated, same pattern as
      `/releases`)
- [x] `GET /api/v1/exceptions` + `POST /api/v1/exceptions/:id/resolve`: aggregates
      REJECTED/RESUBMISSION_REQUIRED packages and DEAD_LETTER jobs for the caller's org;
      resolve advances a package one step via the existing state machine
      (`assertTransition`) or resets a dead-lettered job to QUEUED for one more attempt
      (docs/DECISIONS.md D15) — never auto-fixes the underlying cause
- [x] `GET /api/v1/integrations`: read model over `integration_connections`
      (docs/DECISIONS.md D16); seed data added for the 3 mock eRecording vendors plus
      the LOS/TMS and storage interface stubs
- [x] `apps/web`: `/exceptions` (list + resolve button) and `/integrations` (health
      table) screens, nav updated

**STATUS:** DONE
**FILES CREATED:** `packages/domain-workflow/src/audit-log.ts` + test (2 tests);
`apps/api/src/routes/{audit-events,exceptions,integrations}.ts`;
`apps/web/app/exceptions/page.tsx`, `apps/web/app/integrations/page.tsx`.
**FILES MODIFIED:** `apps/api/src/routes/{auth,packages,webhooks}.ts` (audit-event calls),
`apps/api/src/app.ts` (mounted the 3 new routers), `apps/api/package.json` (added
`@project-lien/domain-workflow` dependency), `packages/domain-workflow/src/index.ts`,
`packages/db/src/seed.ts` (integration_connections demo rows), `apps/web/app/layout.tsx`
(nav links), `apps/api/src/routes.test.ts` (new coverage, replacing the now-stale
"audit-events is unimplemented" assertion), `docs/DECISIONS.md` (D15, D16).
**TESTS RUN:** `pnpm --filter @project-lien/domain-workflow test`,
`pnpm --filter @project-lien/api test`, `pnpm --filter @project-lien/web build`, a full
workspace `turbo run build test lint --concurrency=1`, and a real end-to-end pass: seeded
the dev Postgres DB, booted the compiled API server and `next start`, logged in via a
real headless-Chromium Playwright script, confirmed `/integrations` renders the seeded
SIMPLIFILE/CSC/EPN/GENERIC_LOS/S3_COMPATIBLE rows, created a real package via the API,
forced it to REJECTED via SQL, confirmed it appeared on `/exceptions`, clicked the real
"Resolve" button in the browser, and confirmed in Postgres that the package transitioned
to RESUBMISSION_REQUIRED with a matching `exception.package_resolved` audit-event row.
**TEST RESULTS:** 44/44 turbo tasks passing (18 domain-workflow, 20 api, plus all other
packages); manual E2E script passed all assertions; demo data cleaned up after
verification.
**KNOWN LIMITATIONS:** Integration health is a static read model, not a live probe
(docs/DECISIONS.md D16) — there is no real vendor to health-check against in this
project's mocked-integration architecture. (`packages/adapters-los` and
`packages/adapters-storage` were found to be stale Phase-1 stubs while working on this
phase and were built out for real as part of it — see Phase 12 below — rather than left
as-is, since their doc comments falsely claimed later-phase completion.)
**NEXT STEP:** Phase 12 — full automated testing.

## Phase 12 — Full automated testing
- [x] `packages/adapters-storage`: real `LocalFsDocumentStorage` (genuine `node:fs/promises`
      I/O, path-traversal protection, content-type sidecar file) behind the pre-existing
      `IDocumentStorage` interface, plus a shared `runDocumentStorageContractTests` suite
      (mirroring the eRecording-adapter contract-test pattern) — closes a stale gap where
      this package's doc comments claimed completion it didn't have
- [x] `packages/adapters-los`: real in-memory `GenericMockLosConnector` behind the
      pre-existing `ILosConnector` interface, plus a shared contract-test suite — same gap,
      same fix
- [x] `POST /api/v1/releases/:id/preflight`: first real wiring of Phase 3's document
      renderer + pre-flight engine into an actual request (previously only unit-tested in
      isolation) — renders real HTML/PDF, checks margins against the real bytes, runs
      structural-only pre-flight (`vision: null` — docs/DECISIONS.md D17), transitions
      DRAFT/PREFLIGHT_FAILED/VALIDATING -> READY or PREFLIGHT_FAILED
- [x] `POST /api/v1/releases/:id/submit`, `/resubmit`, `/cancel`: the rest of the package
      lifecycle's action endpoints, in `apps/api/src/routes/package-actions.ts`
- [x] `apps/worker/src/handlers/submit-package.ts` (new `SUBMIT_PACKAGE` job): first real
      wiring of Phase 4's PRIA serializer and Phase 5's eRecording adapters into the
      lifecycle — renders the document, computes the fee estimate, auto-funds escrow
      (docs/DECISIONS.md D17), serializes PRIA XML, submits to the resolved vendor adapter,
      transitions SUBMITTING -> SUBMITTED/REJECTED, enqueues the first poll
- [x] `apps/worker/src/handlers/reconcile-fee.ts` (new `RECONCILE_FEE` job): first real
      wiring of Phase 6's escrow reconciliation logic into the lifecycle — RECORDED ->
      RECONCILING -> COMPLETE, dispatches `fee.adjusted` when the outcome isn't BALANCED
- [x] `apps/worker/src/handlers/poll-vendor-submission.ts`: fixed a real production bug
      found while wiring this up for real — the handler never re-scheduled polling once a
      package reached ACCEPTED/COUNTY_PROCESSING, so a package would get stuck forever
      between vendor acceptance and county recording; now any non-terminal vendor status
      (SUBMITTED or ACCEPTED) always re-enqueues another poll
- [x] `apps/worker/src/handlers/statutory-deadline-scan.ts`: fixed two real bugs — it never
      actually dispatched the required `deadline.at_risk` webhook, and it re-inserted a
      duplicate `workflow_events` row on every scheduler tick regardless of whether
      anything had changed; now dedupes on the package's last-recorded risk level (fires
      once per risk-level escalation, not once per tick — E2E scenario G)
- [x] `packages/domain-workflow/src/state-machine.ts`: fixed a real bug found by E2E
      scenario C — `SUBMITTED -> REJECTED` was illegal (only `COUNTY_PROCESSING ->
      REJECTED` was modeled), so a vendor rejecting a submission before county acceptance
      dead-lettered the poll job instead of recording a normal rejection (docs/DECISIONS.md
      D18)
- [x] `apps/api/src/routes/package-actions.ts`: fixed a real bug found by E2E scenario C —
      `/submit`'s idempotency key never varied across submission attempts of the same
      package, so a legitimate resubmission after rejection could never enqueue a second
      `SUBMIT_PACKAGE` job; now scoped per attempt (docs/DECISIONS.md D18). Also fixed
      `/preflight` refusing to re-run from the `VALIDATING` status that `/resubmit` leaves a
      package in (same doc).
- [x] `apps/worker/src/e2e-scenarios.test.ts`: 8 of docs/TEST_STRATEGY.md's 10 named E2E
      scenarios (A, B, C, D, F, H, I, J), driven against real Postgres, the real compiled
      Express app (via supertest), and the real job-claim/dispatch/complete-or-fail loop
      (`runNextJob` mirrors `processOneJob` from `src/index.ts` exactly, not a simplified
      stand-in)

**STATUS:** DONE (scenario E explicitly out of scope — see Known Limitations)
**FILES CREATED:** `packages/adapters-storage/src/{types,local-fs-storage,contract-tests,
local-fs-storage.test,index}.ts`; `packages/adapters-los/src/{types,mock-connector,
contract-tests,mock-connector.test,index}.ts`; `apps/api/src/routes/package-actions.ts`;
`apps/worker/src/handlers/{submit-package,reconcile-fee}.ts`;
`apps/worker/src/e2e-scenarios.test.ts`.
**FILES MODIFIED:** `packages/domain-documents/src/preflight.ts` (`vision` made nullable);
`packages/adapters-erecording/src/{types,mock-adapter}.ts` (fee estimate/actual fields,
`feeVarianceCents`/`rejectOnPollCount`/`throwOnPollCount` test hooks, removed dead
`outcome` field); `packages/domain-workflow/src/state-machine.ts` (+test — `SUBMITTED ->
REJECTED`); `apps/worker/src/handlers/poll-vendor-submission.ts` (continued polling past
ACCEPTED); `apps/worker/src/handlers/statutory-deadline-scan.ts` (+test — real webhook
dispatch, per-risk-level dedup); `apps/worker/src/job-dispatcher.ts` (registered the 2 new
job types); `apps/api/src/app.ts` (mounted package-actions router); `apps/api/package.json`,
`apps/worker/package.json` (new workspace deps); `apps/worker/vitest.config.ts`
(`fileParallelism: false` + env block, needed once a test in this package started booting
the real API app); `docs/DECISIONS.md` (D17, D18).
**TESTS RUN:** `pnpm --filter @project-lien/domain-workflow test`,
`pnpm --filter @project-lien/api test`, `pnpm --filter @project-lien/worker test`, a full
workspace `pnpm turbo run build test lint --concurrency=1`.
**TEST RESULTS:** 44/44 turbo tasks passing. `apps/worker`: 14/14 tests across 5 files,
including all 8 new E2E scenarios (A successful recording, B pre-flight rejection, C county
rejection + resubmission + exception-center recovery, D vendor-outage retry with real
backoff, F duplicate-submission idempotency, H fee-overage refund, I fee-shortage
deficit-covered, J crash-and-reclaim-mid-workflow). `apps/api`: 20/20. `domain-workflow`:
19/19 (18 + 1 new state-machine case).
**KNOWN LIMITATIONS:** Scenario E (duplicate inbound vendor/county webhook) is not
exercised — this build only has an *outbound* webhook dispatcher
(docs/REQUIREMENTS_MATRIX.md #22 stays IN_PROGRESS for exactly this reason); there is no
inbound webhook receiver endpoint to send a duplicate payload to, so writing a test against
different code and calling it scenario E would misrepresent coverage. The three Phase-12
simplifications (structural-only pre-flight, no signature/notary capture feature, escrow
auto-funding) are documented in docs/DECISIONS.md D17, not hidden by the tests that work
around them.
**NEXT STEP:** Phase 13 — security hardening + observability.

## Phase 13 — Security hardening + observability
- [x] Reconciled docs/SECURITY.md (a Phase 1 target-architecture doc) against the actual
      code and fixed every mismatch found, rather than leaving an aspirational document
      standing next to a different reality (docs/DECISIONS.md D19):
      - Rate limiting was documented but didn't exist — added `express-rate-limit`
        (`POST /auth/login` tightly limited, the rest of `/api/v1` more loosely)
      - CORS was wide open and undocumented as such — added a real `CORS_ORIGIN` allowlist
      - A refresh token was issued at login since Phase 1 but nothing ever consumed it —
        added `POST /api/v1/auth/refresh`
      - `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` were documented as configurable but hardcoded —
        wired to env, with `.env.example`'s stale `30d` refresh placeholder corrected to
        the actual `7d`
      - The pino log-redaction config had never been exercised by a test — added one
        (`logger.test.ts`, using a new optional `destination` param on `createLogger`)
      - A production process could start with every secret still at its insecure
        `.env.example` default — added a fail-fast startup check
      - Corrected overclaims in docs/SECURITY.md itself (argon2id -> actual bcryptjs per
        D2; "refresh tokens stored hashed" -> actual stateless/unrevoked; API-key auth for
        `API_CLIENT` -> not built; a malware-scan interface implied wired into an upload
        path -> no upload endpoint exists to call it from)

**STATUS:** DONE
**FILES CREATED:** `apps/api/src/rate-limit.test.ts`, `apps/api/src/cors.test.ts`,
`apps/api/src/auth/jwt.test.ts`, `packages/shared-config/src/logger.test.ts`.
**FILES MODIFIED:** `packages/shared-config/src/env.ts` (+test — `CORS_ORIGIN`,
`RATE_LIMIT_*`, `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL`, `assertNoInsecureDefaultsInProduction`,
`resetEnvCacheForTests`), `packages/shared-config/src/logger.ts` (optional `destination`
param for testability), `packages/shared-config/src/index.ts` (new export);
`apps/api/src/app.ts` (CORS allowlist wiring, login + general rate limiters);
`apps/api/src/routes/auth.ts` (`POST /refresh`, TTLs passed through);
`apps/api/src/auth/jwt.ts` (configurable TTL params); `apps/api/src/routes.test.ts` (new
refresh-flow tests); `apps/api/vitest.config.ts`, `apps/worker/vitest.config.ts` (generous
test-wide rate-limit env defaults so unrelated tests can't be spuriously rate-limited as
the suites grow); `.env.example` (corrected/added the vars above); `docs/SECURITY.md`
(rewritten against the real implementation); `docs/DECISIONS.md` (D19).
**TESTS RUN:** `pnpm --filter @project-lien/shared-config test`,
`pnpm --filter @project-lien/api test`, a full workspace
`pnpm turbo run build test lint --concurrency=1`.
**TEST RESULTS:** 44/44 turbo tasks passing. `shared-config`: 12/12 (3 files, incl. the new
`logger.test.ts` and expanded `env.test.ts`). `api`: 34/34 across 5 files (up from 20/2),
all new tests exercising real behavior (an actual 429 after the configured limit, an actual
non-reflected disallowed CORS origin, an actual decoded JWT `exp` claim matching a custom
TTL, an actual working end-to-end refresh-token exchange against a real protected route).
**KNOWN LIMITATIONS:** No server-side refresh-token revocation list (a leaked or
should-be-invalidated refresh token remains valid until its own expiry); no API-key
authentication for the `API_CLIENT` role / developer-API area (docs/REQUIREMENTS_MATRIX.md
#31, unchanged from before this phase); no real malware-scanning, HSM/KMS, WAF, or CI
secret-scan step — all explicitly named as deferred in docs/SECURITY.md rather than
fabricated. Rate limiting uses an in-memory per-process store (fine for this single-process
build; would need a shared store like Redis behind a load balancer with multiple API
instances — noted for Phase 14/production).
**NEXT STEP:** Phase 14 — Docker / deployment / CI.

## Phase 14 — Docker / deployment / CI
- [x] Re-tested the sandbox's Docker capability rather than trusting the Phase 1 note that
      carried forward unchallenged since — found it was half-stale (docs/DECISIONS.md D20):
      the daemon runs fine here, only container-registry pulls are blocked by network
      egress, a narrower and more accurate finding than "no Docker daemon."
- [x] Used that finding to verify as much as actually possible without a completed image
      pull, and caught two real, previously-undiscovered bugs by doing so:
      - `Dockerfile.web`'s final stage shipped dangling symlinks (pnpm's node_modules
        symlinks into a root `.pnpm` store that stage never copied) — fixed via Next.js
        `output: "standalone"` + a rewritten final stage; verified by actually booting
        `apps/web/.next/standalone/apps/web/server.js` and getting a real HTTP 200.
      - `docker-compose.yml`'s `api`/`worker` services set `NODE_ENV=production` while
        relying on the schema's insecure default secrets (and MinIO's own
        `minioadmin`/`minioadmin`), which Phase 13's new fail-fast check would reject at
        startup — fixed with distinct real placeholder secrets; verified by booting
        `apps/api/dist/server.js` and `apps/worker/dist/index.js` directly with the exact
        new compose env vars (clean start, `/health`/`/ready` correct) and by reproducing
        the original failure with the old values.
- [x] Wrote `.github/workflows/ci.yml` (Postgres 16-alpine service container, install,
      typecheck, lint, test, build, then a `docker-build` job building all 3 Dockerfiles on
      GitHub-hosted runners, which have normal registry access this sandbox doesn't).
- [x] Wrote `.github/dependabot.yml` (npm workspace root with a grouped `next` update,
      Docker images under `infra/docker`, GitHub Actions) and
      `.github/workflows/dependency-audit.yml` (weekly non-gating `pnpm audit`).
- [x] Ran a real `pnpm audit --prod` and fixed what could be fixed without an unbudgeted
      major migration: `next` 14.2.15 -> 14.2.35 (patches a critical middleware
      authorization-bypass CVE), `kysely` ^0.27.4 -> ^0.28.17 across all 6 packages that use
      it (3 high SQL/JSON-path-injection CVEs), `postcss` pinned >=8.5.23 via a root
      `pnpm.overrides` entry (Next's own transitive dependency). Deferred the remaining
      ~21 advisories that require a Next 15/React 19 major bump, named explicitly in
      docs/DECISIONS.md D22 rather than rushed in without regression time.
- [x] Found and fixed an unrelated, previously-invisible bug while re-verifying after the
      dependency bumps: plain `pnpm test` (no manually-added flag) genuinely fails —
      `apps/api` and `apps/worker` race each other's `DROP SCHEMA public CASCADE` against
      the one shared test database when Turborepo runs both packages' test tasks
      concurrently. Every prior phase's verification had accidentally masked this by always
      including `--concurrency=1` by hand. Fixed for good by baking `--concurrency=1` into
      the root `test`/`test:e2e` scripts themselves (docs/DECISIONS.md D21).
- [x] Corrected the stale "no Docker daemon" claim in docs/LOCAL_DEVELOPMENT.md to match
      the D20 finding, and updated docs/REQUIREMENTS_MATRIX.md rows #37/#38.

**STATUS:** DONE
**FILES CREATED:** `.github/workflows/ci.yml`, `.github/workflows/dependency-audit.yml`,
`.github/dependabot.yml`.
**FILES MODIFIED:** `apps/web/next.config.js` (`output: "standalone"`);
`infra/docker/Dockerfile.web` (rewritten final stage); `docker-compose.yml` (real distinct
secrets for `api`/`worker`, real MinIO credentials); `package.json` root (`test`/`test:e2e`
scripts now pass `--concurrency=1`; added `pnpm.overrides.postcss`); `apps/web/package.json`
(`next` bump); `packages/db`, `packages/domain-escrow`, `packages/domain-jurisdiction`,
`packages/domain-workflow`, `apps/api`, `apps/worker` `package.json` files (`kysely` bump);
`pnpm-lock.yaml`; `docs/LOCAL_DEVELOPMENT.md` (corrected Docker-availability claim);
`docs/DECISIONS.md` (D20, D21, D22); `docs/REQUIREMENTS_MATRIX.md` (rows #37, #38).
**TESTS RUN:** `pnpm --filter @project-lien/web build` (standalone-output verification);
direct boot of `apps/web/.next/standalone/apps/web/server.js` + `curl /login`; direct boot
of `apps/api/dist/server.js` and `apps/worker/dist/index.js` against the new compose env
(both with the corrected secrets and, to confirm the fail-fast check works, the original
insecure ones); `pnpm test --force` (root, post-concurrency-fix, forcing full cache bypass);
`pnpm turbo run build test lint --concurrency=1 --force` (post dependency bumps).
**TEST RESULTS:** Standalone server boot: real non-symlink `node_modules` confirmed on
disk, `curl http://127.0.0.1:3099/login` -> HTTP 200. Compose-env boot: `api`/`worker` start
cleanly with new secrets, `/health`/`/ready` correct; both processes correctly refuse to
start with the old insecure defaults, confirming Phase 13's fail-fast check actually fires.
`pnpm test --force`: 25/25 tasks, 125/125 tests passing (previously silently dependent on a
hand-typed flag every prior phase happened to include). Post-dependency-bump full suite:
44/44 turbo tasks passing. `pnpm audit --prod`: 37 advisories (1 critical/15 high/17
moderate/4 low) -> 21 (0 critical/~10 high/~9 moderate/2 low) after the three bumps above.
Docker image builds themselves were not completed end-to-end in this sandbox (registry pulls
blocked, see D20) — that verification now runs for real on every push via
`.github/workflows/ci.yml`'s `docker-build` job.
**KNOWN LIMITATIONS:** No actual `docker build`/`docker compose up` was run to completion in
this sandbox (registry access blocked, not a codebase issue — see docs/DECISIONS.md D20);
first real confirmation of that path will be the next CI run. The remaining ~21 dependency
advisories require a Next 15/React 19 major-version migration, deliberately deferred
(docs/DECISIONS.md D22) rather than rushed in without time to regression-test a major
framework bump. Rate limiting (from Phase 13) is still in-memory/per-process, which matters
more once this ships behind a real multi-instance production deploy — noted there, unchanged
by this phase. `pnpm audit`'s dependency-audit CI job is intentionally non-gating
(informational only), so a newly-disclosed advisory won't block a PR by itself.
**NEXT STEP:** Phase 15 — end-to-end verification and documentation.

## Phase 15 — End-to-end verification and documentation
- [x] Built a committed, automated replacement for the operations web app's manual E2E
      verification (docs/REQUIREMENTS_MATRIX.md #25-#27, #29-#30 had real coverage from
      Phase 10/11's one-off Playwright scripts, but nothing that survived past that
      session): `apps/web/e2e/global-setup.ts` boots the real compiled api/worker/web
      processes against a dedicated `project_lien_e2e_web` database, and
      `apps/web/e2e/golden-path.spec.ts` drives real headless Chromium through login →
      jurisdiction lookup (against the real seeded CA/Los Angeles rule) → integrations →
      creating a real package via the API and viewing it on the real queue/detail screens
      → forcing it to REJECTED via direct SQL (mirroring Phase 11's own manual method) →
      clicking the real "Resolve" button and confirming the real resulting Postgres row
      (docs/DECISIONS.md D23). Wired into `pnpm test:e2e` (already `turbo run test:e2e
      --concurrency=1` from Phase 14) and into `.github/workflows/ci.yml`.
- [x] Found and fixed two real bugs building that suite: the pinned `@playwright/test`
      range resolved to a version expecting a newer Chromium than this sandbox's
      pre-installed one (fixed the same way `packages/domain-documents`'s PDF renderer
      already had to, D4/D23); and spawning the web process through `pnpm --filter ...
      start` left an orphaned `next-server` on its port after a killed run, because
      `SIGTERM` to the `pnpm` wrapper doesn't reliably reach the actual server it spawns
      as a grandchild (fixed by spawning Next's own entrypoint directly).
- [x] Ran a genuine clean-room re-verification (something no prior phase had actually
      done): `rm -rf dist .turbo` workspace-wide, then a full rebuild. This surfaced a
      third, unrelated, previously-invisible bug — `pnpm clean` had been a silent no-op
      since Phase 1, because the root script called a `turbo run clean` task that **no
      package in the repository ever defined** — so every prior "clean rebuild" in this
      project's history was actually `rm -rf dist` typed by hand, which never clears
      `tsc`'s `--incremental` `tsconfig.tsbuildinfo` cache; that stale cache made one
      package's `tsc` report success while silently emitting zero files, which the very
      devDependency wiring this phase added (apps/web -> api/db/worker, purely so
      Turborepo's graph rebuilds them before the new Playwright suite runs) then exposed
      as a confusing downstream "cannot find module" in an unrelated package
      (docs/DECISIONS.md D24). Fixed with a real `"clean": "rm -rf dist
      tsconfig.tsbuildinfo"` script (plus `.next`) added to all 15 buildable packages.
- [x] Corrected two further stale doc claims found during this pass: `docs/ARCHITECTURE.md`
      still said migrations ran "via Prisma" and the datastore diagram said "PostgreSQL 16
      (Prisma)" — both left over from before the Phase 1 Prisma → hand-authored-SQL pivot
      (docs/DECISIONS.md D2) and never corrected until now; `docs/LOCAL_DEVELOPMENT.md`'s
      first-time-setup snippet still ran `prisma migrate deploy` (a command that doesn't
      exist in this project) instead of the real `pnpm --filter @project-lien/db migrate`.
- [x] Re-ran the entire verification surface one final time from the genuinely clean state
      above, as a single end-to-end confirmation that nothing this project has built or
      fixed across 15 phases has silently regressed: full workspace build, full unit +
      integration test suite (including the worker's 8 E2E scenarios A-J), full lint, and
      now the web Playwright suite too — all green together for the first time.

**STATUS:** DONE
**FILES CREATED:** `apps/web/e2e/global-setup.ts`, `apps/web/e2e/golden-path.spec.ts`,
`apps/web/playwright.config.ts`.
**FILES MODIFIED:** `apps/web/package.json` (`@playwright/test`, `pg`, `@types/pg`
devDependencies; `@project-lien/api`/`db`/`worker` added as devDependencies purely for
Turborepo build-graph ordering, not code use; `test:e2e` and `clean` scripts); `packages/
adapters-los`, `packages/adapters-storage`, `packages/shared-config`, `packages/
domain-fees`, `packages/domain-documents`, `packages/domain-workflow`, `packages/
domain-escrow`, `packages/db`, `packages/shared-types`, `packages/adapters-erecording`,
`packages/domain-pria`, `packages/domain-jurisdiction`, `apps/worker`, `apps/api`
`package.json` files (real `clean` scripts); `.github/workflows/ci.yml` (Playwright
Chromium install + E2E step); `docs/ARCHITECTURE.md` (Prisma -> Kysely correction);
`docs/LOCAL_DEVELOPMENT.md` (corrected migrate command, documented `pnpm clean`/
`pnpm test:e2e`'s real current behavior); `docs/TEST_STRATEGY.md` (new Web UI E2E
section); `docs/DECISIONS.md` (D23, D24); `docs/REQUIREMENTS_MATRIX.md` (rows #25-#27,
#29-#30); `pnpm-lock.yaml`.
**TESTS RUN:** `pnpm --filter @project-lien/web test:e2e` standalone (run twice
consecutively to confirm teardown/re-run reliability); `pnpm test:e2e` (root, via turbo)
from both a warm and a genuinely clean (`rm -rf dist .turbo tsconfig.tsbuildinfo`
workspace-wide) state; `pnpm turbo run clean --concurrency=1`; `pnpm turbo run build test
lint --concurrency=1 --force` from that same clean state.
**TEST RESULTS:** New Playwright suite: 5/5 passing, real browser against the real
compiled stack, consistently across repeated runs, with clean process/database teardown
verified each time (no orphaned `next-server`, no leftover `project_lien_e2e_web`
database). `pnpm turbo run clean`: 15/15 tasks now actually execute (previously silently
skipped). Full clean-room `pnpm turbo run build test lint --concurrency=1 --force`: 44/44
tasks. `pnpm test:e2e` (root): 16/16 tasks, covering both the worker's 8 E2E scenarios and
the new 5-test web suite.
**KNOWN LIMITATIONS:** The web E2E suite covers the golden path across every built screen
but isn't exhaustive (no negative-path assertions, e.g. a failed login or a validation
error toast) — reasonable scope for closing the "no repeatable coverage at all" gap this
phase targeted, not a claim of exhaustive UI test coverage. Every other known limitation
named across Phases 1-14 (docs/DECISIONS.md, docs/REQUIREMENTS_MATRIX.md's MOCKED/DEFERRED
rows, docs/EXTERNAL_DEPENDENCIES.md, docs/ASSUMPTIONS.md) stands unchanged — this phase's
job was verifying and documenting the system as actually built, not closing every
previously-named gap. See FINAL_SYSTEM_REVIEW.md for the complete, consolidated picture.
**NEXT STEP:** None — this was the last planned phase. FINAL_SYSTEM_REVIEW.md consolidates
the full build for a reviewer; ongoing work from here is whatever the user decides to
prioritize next (real vendor credentials, the Next 15 migration named in D22, a document
viewer/upload endpoint, etc.).
