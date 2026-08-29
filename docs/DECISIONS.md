# Architecture Decision Record

Each decision below resolves a place where Requirements.pdf either contradicted itself,
described something never actually implemented, or left an open architectural choice.
"Requirements.pdf" is a 123-page transcript of an evolving chat with an AI (Gemini) about
this product, not a specification — later corrections in that transcript are treated as
superseding earlier ones, per the project's source-of-truth rule.

## D1: Language & runtime
**Decision:** TypeScript on Node.js 20 LTS for all backend/worker/adapter code. React 18 +
Next.js 14 (App Router) + Tailwind CSS for the frontend.
**Why:** Matches the large majority of code samples in Requirements.pdf (Modules 1–6,
the dashboard component). Keeps one language across the stack, which matters for a
solo/small-team build.

## D2: Database & schema management
**Decision:** PostgreSQL 16. Hand-authored, numbered raw-SQL migrations (run by a small
custom runner) plus **Kysely** for typed query building at runtime.
**Why (original plan, then revised):** Requirements.pdf contains at least three drifting
versions of the SQL schema (page 10 initial, page 37 Module-1 version, page 85
consolidated `000_init_all.sql`). We derived one coherent schema from the *union* of
entities across the whole document (see docs/REQUIREMENTS_MATRIX.md); that part of the
plan didn't change. What changed is the tool: Prisma was the first choice, but Prisma's
CLI (`generate`, `migrate dev/deploy`) fetches a native "query engine"/"schema engine"
binary from `binaries.prisma.sh` on every fresh install, and that host returned `403` in
this build environment (confirmed directly with `curl`, not just via the CLI). Rather
than build the platform's core data layer on a tool that silently can't apply its own
migrations the moment a network policy (a corporate proxy, an offline CI runner, this
sandbox) doesn't allow that one CDN, we moved to a dependency chain that only touches the
ordinary npm registry: `pg` for the driver, hand-written `.sql` files under
`packages/db/migrations/` as the single source of truth for the schema, a ~40-line
runner (`packages/db/src/migrate.ts`) that tracks applied migrations in a
`_migrations` table and runs each new file inside a transaction, and Kysely for
compile-time-checked queries against a hand-maintained `Database` type
(`packages/db/src/schema.ts`) mirroring the SQL 1:1. This was verified end-to-end in
this environment: migration applies from empty against a real local Postgres 16
instance. If a future environment has unrestricted network access, Prisma remains a fine
choice and could be reintroduced — this decision is about not taking on that fragility by
default for something as central as schema migrations.

## D3: Workflow orchestration — Temporal vs. DB-backed state machine
**Decision:** Database-backed workflow engine: a `workflow_events` / `jobs` table in
Postgres, a worker process that claims jobs with `FOR UPDATE SKIP LOCKED`, explicit
retry counters with exponential backoff, and a dead-letter state after N failures.
**Why:** Requirements.pdf *describes* Temporal.io/Kafka in its aspirational architecture
diagrams (pages 29, 31) but the code it actually built (Module 6) never used them — it
used a bare `setInterval` polling loop with no persistence of retry state, no backoff, no
idempotency guard, and no recovery story after a process restart. That is a real gap
against this project's explicit requirement for retries/backoff/dead-letter/idempotency/
restart-recovery. Temporal would satisfy that requirement well, but it also requires a
separate server, its own persistence store, and an SDK the developer has to learn — which
conflicts with "must remain runnable locally with straightforward commands" and "a
developer should be able to clone the repo and get a useful environment running." A
Postgres-backed queue keeps the whole system observable with plain SQL and is sufficient
for this domain's throughput (packages per day, not per second). This is documented as
revisitable: if volume ever demands true durable workflow histories with complex human-
in-the-loop signals, Temporal is the natural upgrade path, and the orchestrator is built
behind an interface so that swap doesn't ripple through the domain code.

## D4: Document generation — Puppeteer/HTML vs. pdf-lib drawText
**Decision:** Canonical document generation uses Handlebars HTML templates rendered to
PDF via headless Chromium (Puppeteer). `pdf-lib` is used downstream for PDF *inspection*
and *margin/stamp-zone normalization* only (measuring pages, shifting/padding content,
never regenerating body text).
**Why:** Requirements.pdf shows two competing approaches: an HTML/Puppeteer pipeline
(pages 5–6, 14–15) and a programmatic `pdf-lib` `drawText` generator (Module 2, pages
47–48, `StatutoryDocGenerator.ts`). The latter hardcodes legal boilerplate as string
literals with manual x/y coordinates, which is unmaintainable and risky for text a
non-engineer will need to review and correct per state. Templates are reviewable by a
non-engineer, diffable, and match the "master template with conditional injectors" idea
Requirements.pdf itself proposes (page 27) as the realistic path to covering 50 states.
**Decision (revised, Phase 3):** headless-Chromium driver is **Playwright**, not
Puppeteer. Both wrap the same Chrome DevTools Protocol and the swap is a one-file change
(`packages/domain-documents/src/pdf/renderer.ts`); the reason is entirely environmental,
the same class of issue as D2's Prisma pivot: this build sandbox comes with Playwright's
Chromium already installed at a fixed path (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`,
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`), so `npx playwright install` is never invoked and
there is no at-install-time CDN fetch to fail. Puppeteer's install step downloads its own
Chromium build from `storage.googleapis.com` on every fresh `pnpm install`, which is
exactly the kind of external-CDN dependency that broke Prisma in this same sandbox — using
Puppeteer would have been an unverified bet that a *different* CDN happens to be reachable.
Playwright's `chromium.launch()` (resolved via its own installed-browser registry, or an
explicit `executablePath` override) was verified working end-to-end in this build (see
PROGRESS.md Phase 3). On a machine without a pre-installed browser, `playwright install
chromium` is the equivalent one-time setup step (documented in docs/LOCAL_DEVELOPMENT.md);
the rendering code itself does not care which tool fetched the browser.

## D5: Computer-vision / notary-seal validation
**Decision:** Define `ISignatureVisionProvider` (checks: signature present, notary seal
present, scan resolution, clipping) with a deterministic mock/rule-based implementation
for local dev and tests. No real computer-vision model is integrated.
**Why:** Requirements.pdf's `VisionValidator.ts` (Module 2, pages 44–46) is not real
computer vision — it counts dark pixels in the lower third of the page and edge-transition
density as a signature/seal proxy. Presenting that as production CV would violate this
project's explicit instruction not to claim something works before it's verified. The
interface boundary lets a real document-AI vendor (Textract, Google Document AI, a
notary-specific vendor) be swapped in later without touching the pre-flight pipeline.

## D6: eRecording vendor adapters
**Decision:** `IErecordingProvider` interface (`submit`, `getStatus`, `cancel`,
`getReceipt`, `getRecordedDocument`, `getFees`, `healthCheck`) with Simplifile, CSC, and
ePN implemented as **sandbox/mock adapters only**, plus contract tests that any future
real adapter must pass.
**Why:** Requirements.pdf's adapters (Module 4) use invented endpoint paths
(`/v2/packages/submit`), invented SOAP actions, and invented response shapes — the
document itself never claims these came from real vendor documentation. Per this
project's explicit rule against fabricating vendor APIs, none of those exact shapes are
treated as real; they're kept as *design input* for what a REST vs. SOAP vs. JSON adapter
shape looks like, reimplemented as clearly-labeled mocks. Real Simplifile/CSC/ePN
integration requires vendor sandbox credentials and specs (tracked in
EXTERNAL_DEPENDENCIES.md).

## D7: PRIA packaging
**Decision:** A canonical, vendor-neutral internal package model; a PRIA-shaped XML
serializer for the mock pipeline; schema validation checks our own internal contract
(structural completeness), not the real PRIA XSD.
**Why:** Requirements.pdf changed the PRIA XML namespace mid-document
(`.../standards/3.0.0` → `.../standards/3/0/0`, page 60) while admitting neither was
checked against a real spec. The real PRIA XSD is licensed/member-gated — we don't have
it — so validating against it would be fabricating conformance. We validate structure
(required nodes present, embedded file non-empty, county FIPS present) and label PRIA
XSD conformance as an explicit external dependency.

## D8: PRIA package level
**Decision:** Implement PRIA "Level 2" (rendered PDF + XML metadata wrapper) only for v1.
Level 3 (SMART doc, X.509-signed XML/canvas binding) is modeled as a future adapter
capability flag, not implemented.
**Why:** Requirements.pdf names both levels (page 50) but never implements Level 3, and
Level 3 requires a PKI/signing vendor we don't have. Building it now would be exactly the
kind of unverified "production-ready" claim this project forbids.

## D9: Compliance rule data (50-state matrix)
**Decision:** All state/county rule rows are seeded with `status = UNVERIFIED`,
`source = 'requirements_pdf_transcript'`. None are marked `VERIFIED` unless independently
re-derived from a citable primary source during Phase 2, in which case the citation is
recorded in the rule's `source` field. No county-level FIPS fee data is fabricated beyond
a small hand-picked demo set.
**Why:** The 50-state numbers in Requirements.pdf (statutory deadline days, daily
penalties, margins, trustee/witness flags) are the AI chat's own invented sample data —
the document says as much on page 25 ("we have not yet included all state-specific rules,
laws"). Treating them as law would violate this project's explicit rule 7. They are useful
*shape* (which states are lien-theory vs. title-theory, what fields a rule needs) but not
truth.

## D10: Naming reconciliation
**Decision:** Canonical names, superseding earlier transcript versions:
- Table `state_jurisdiction_rules` (not the earlier `state_compliance_rules`).
- Type `CountyJurisdictionRule` (not the earlier `CountyRule`), matching the later
  "Fix 3" correction in the transcript (page 99–100).
- `doc_type` enum is the **union** of every instrument type used across the final 50-state
  seed: `SATISFACTION_OF_MORTGAGE`, `DEED_OF_RECONVEYANCE`, `RELEASE_OF_LIEN`,
  `CANCELLATION_OF_SECURITY_DEED`, `SATISFACTION_OF_SECURITY_INSTRUMENT`,
  `CERTIFICATE_OF_SATISFACTION`, `RELEASE_OF_DEED_OF_TRUST`.
- ePN always has its own adapter; it is never silently aliased to Simplifile (the
  transcript's first draft did this, then explicitly corrected it on page 69).
- PDF margin math always clamps `yOffset` to `>= requiredBottomPoints` (the transcript's
  page 60–61 correction), and vendor XML payloads are sent as raw UTF-8, never
  double-base64-encoded (page 68–69 correction).

## D11: Auth & tenancy
**Decision:** Local email/password + JWT (access + refresh) auth with an
organization-scoped RBAC model, built behind an interface so Auth0/Okta/SAML SSO can be
substituted later without changing authorization logic.
**Why:** Requirements.pdf names Auth0/Okta (page 8) but never supplies credentials or
tenant config, and this project must run without vendor credentials.

## D12: Document storage
**Decision:** MinIO (S3-compatible) in docker-compose for local/dev; storage access goes
through an `IDocumentStorage` interface so AWS S3 + KMS can be dropped in for production
with only a config/adapter change.

## D13: Monorepo tooling
**Decision:** pnpm workspaces + Turborepo. Apps: `api`, `worker`, `web`. Shared packages
for the jurisdiction engine, fee engine, document/pre-flight engine, PRIA engine,
workflow engine, escrow ledger, vendor adapters, storage adapter, LOS/TMS adapter,
shared types, and shared config/logging.
**Why:** The domains above are independently testable and reused between the API and the
worker process; a monorepo with shared packages avoids duplicating domain logic between
those two runtimes while keeping one `pnpm install` / one CI pipeline.

## D14: Module output is CommonJS, despite ESM-style source
**Decision:** No `package.json` in this repo sets `"type": "module"`. Combined with
`tsconfig.base.json`'s `module`/`moduleResolution: NodeNext`, this means every package's
source is *authored* in ESM syntax (`import`/`export`, `.js`-suffixed relative imports)
but *compiles* to CommonJS `require()` output — TypeScript's NodeNext mode picks the
output format per package based on its `package.json` `type` field, and the absence of
that field defaults to CommonJS.
**Why:** This was never a deliberate choice — it surfaced in Phase 8 when
`apps/api/src/app.ts` tried to use `import.meta.url` (to resolve `openapi.json`'s path
relative to the compiled file) and `tsc` rejected it with "the 'import.meta' meta-property
is not allowed in files which will build into CommonJS output." The fix used there is the
ambient CommonJS `__dirname` instead. Left as CommonJS output rather than adding
`"type": "module"` everywhere, because switching now would need re-verifying every
package's build/test/runtime behavior (Jest/vitest-style test runners and some npm
packages still assume CJS by default) for no functional benefit at this project's current
stage — worth revisiting deliberately in a later phase if there's a concrete reason to
want native ESM output (e.g. top-level await, or a dependency that is ESM-only).

## D15: Exception center resolution semantics (Phase 11)
**Decision:** `POST /api/v1/exceptions/:id/resolve` does not attempt to auto-fix the
underlying cause of a package rejection or a dead-lettered job. For a package, it
advances exactly one step along the recovery path the state machine already defines
(`REJECTED -> RESUBMISSION_REQUIRED -> VALIDATING`); for a dead-lettered job, it resets
`status` to `QUEUED` with `attempts` zeroed and `last_error` cleared, giving it one more
run through the worker's normal retry/backoff path. The `:id` namespace is shared between
`recording_packages.id` and `workflow_jobs.id` (checked in that order) rather than using
two separate endpoints, matching docs/API.md's single `/exceptions/:id/resolve` route.
**Why:** An operator, not the system, decided the underlying issue (a county rejection
reason, a permanently-broken vendor call) is actually resolved — the API's job is to
re-enter the existing state machine / job queue safely (via `assertTransition` and the
same columns the worker's queue uses), not to guess at a fix. Every resolution is
recorded via `recordAuditEvent` (`exception.package_resolved` / `exception.job_resolved`),
so the exception center itself is auditable.

## D16: Integration connector health is a read model, not a live probe
**Decision:** `GET /api/v1/integrations` reads `integration_connections.health` as last
written — it does not call out to any vendor to check current status when the endpoint is
hit. Demo rows are seeded once per organization in `packages/db/src/seed.ts` (checked via
a lookup rather than a DB-level upsert, since no unique constraint exists on
`(organization_id, vendor)`) for the three mock eRecording vendors this project actually
has adapters for (`packages/adapters-erecording`), plus the LOS/TMS and document storage
interface stubs (`packages/adapters-los`, `packages/adapters-storage`), both seeded with
`health: 'UNKNOWN'` since they are interfaces only, with no adapter behind them yet
(docs/REQUIREMENTS_MATRIX.md #34/#35).
**Why:** A live health check per request would mean this endpoint's latency and
reliability depend on N vendor round-trips, and there is no real vendor to call in this
project's mocked-integration architecture (docs/EXTERNAL_DEPENDENCIES.md) — `health`
values here are illustrative of what a future adapter-driven health-check job would write,
not a live signal. This keeps the same "documented gap, not a fabricated capability"
posture as the mock eRecording adapters themselves.

## D17: Phase 12 simplifications surfaced by wiring pre-flight/submission into real requests
**Decision:** Phase 12 is the first point in this project where `POST /releases/:id/
preflight` and `/submit` are called from a real HTTP request end to end (earlier phases
only unit-tested the document/pre-flight/PRIA/vendor engines in isolation). Doing this for
real surfaced three deliberate v1 simplifications, each left as a documented gap rather
than a fabricated capability:
1. **Structural-only pre-flight.** `PreflightInput.vision` is typed `VisionCheckResult |
   null`; `POST /:id/preflight` always passes `null`. The state machine reaches
   `READY` (via `VALIDATING`) *before* `PENDING_SIGNATURE`/`PENDING_NOTARY` — so no
   signed/notarized document exists yet at the point pre-flight runs, and a vision check
   for a signature or notary seal could never honestly pass. Pre-flight here checks only
   what already exists: margins, required fields, and jurisdiction-specific structural
   requirements (e.g. `TRUSTEE_MISSING`). A future phase that adds a real signature/notary
   capture step would call `runPreflight` a second time, post-capture, with a real
   `vision` result.
2. **No signature/notary capture feature exists yet.** `advanceToReadyToSubmit` (test
   helper, `apps/worker/src/e2e-scenarios.test.ts`) advances a package directly through
   `PENDING_SIGNATURE -> PENDING_NOTARY -> READY_TO_SUBMIT` via direct SQL, matching what
   production code actually does today for these two states (nothing) rather than
   fabricating a fake capture UI/flow. Tracked as a real gap, not hidden by the test.
3. **Escrow auto-funds from the loan's unpaid principal.** There is no "payoff received"
   trigger modeled anywhere in this build, so `submit-package.ts` deposits
   `max(0, estimatedFeeCents - currentBalanceCents)` into the package's escrow account
   immediately before holding the recording fee, rather than requiring a real funds-receipt
   event first.
**Why:** Each of these is a real, load-bearing gap between this build and a production
system — not incidental — so they're called out explicitly here (and referenced inline in
code as "docs/DECISIONS.md D17") rather than silently working around them. All three are
also called out in docs/REQUIREMENTS_MATRIX.md and PROGRESS.md under Phase 12.

## D18: Three production bugs found only by testing the real request path, not mocks
**Decision:** Writing true end-to-end tests (real Postgres, real compiled Express app via
supertest, the same job-claim/dispatch/complete-or-fail loop `apps/worker/src/index.ts`
runs in production) surfaced three genuine bugs that no prior unit test caught, because
prior tests all called the underlying engines directly rather than going through the real
request/job path. All three are now fixed:
- **The state machine forbade a vendor from rejecting a submission before county
  acceptance.** `FORWARD_TRANSITIONS.SUBMITTED` only allowed `COUNTY_PROCESSING`, but a
  real vendor can bounce a submission at intake, before it's ever accepted into county
  processing (E2E scenario C, `PKG-C`) — `poll-vendor-submission.ts` would then throw
  `IllegalTransitionError` trying to move `SUBMITTED -> REJECTED` directly, dead-lettering
  a normal rejection. Fixed by adding `REJECTED` to `SUBMITTED`'s allowed transitions in
  `packages/domain-workflow/src/state-machine.ts`.
- **A resubmission could never enqueue a second `SUBMIT_PACKAGE` job.** `POST /:id/submit`
  used a single idempotency key, `submit-package-${packageId}`, for every submission
  attempt of a package. Since `enqueueJob`'s dedup is `ON CONFLICT (idempotency_key) DO
  NOTHING` — permanent, not per-attempt — a package rejected and then legitimately
  resubmitted (E2E scenario C) could never get a new `SUBMIT_PACKAGE` job at all after its
  first attempt; the resubmission would silently no-op. Fixed by scoping the key to the
  attempt number (`submit-package-${packageId}-attempt-${N}`, where `N` is `1 +` the count
  of existing `vendor_submissions` rows for the package) — two rapid duplicate requests for
  the *same* attempt (E2E scenario F) still collide correctly, since neither has created a
  `vendor_submissions` row yet when both are evaluated.
- **`POST /:id/preflight` couldn't actually be re-run after a resubmission.** `POST
  /:id/resubmit` transitions `RESUBMISSION_REQUIRED -> VALIDATING` and tells the caller to
  call `/preflight` next, but `/preflight`'s own internal logic unconditionally tried to
  transition `pkg.status -> VALIDATING` again — an illegal `VALIDATING -> VALIDATING`
  self-transition once the package was already there. Fixed by adding `VALIDATING` to
  `PREFLIGHT_STARTABLE_FROM` and skipping the redundant initial transition when the
  package is already in `VALIDATING`.
**Why:** This is exactly the scenario the "never claim something works without verifying"
project mandate anticipates — engines that pass their own unit tests can still be wired
together incorrectly, and only exercising the real request/job path end to end catches
that class of bug. All three fixes are covered by `apps/worker/src/e2e-scenarios.test.ts`
(scenario C for the first two, the full scenario suite for the third, since every scenario
after A depends on `/preflight` and `/submit` behaving correctly from a non-DRAFT status
at least once).

## D19: Phase 13 security hardening — real gaps found by checking docs/SECURITY.md against the code
**Decision:** docs/SECURITY.md was written early (Phase 1) as a target architecture and
never reconciled against what actually got built. Phase 13 read every claim in it against
the real code and either implemented the gap for real or corrected the doc to say what
actually exists — never left a claim standing that wasn't true. Concretely:
- **Rate limiting was documented but did not exist.** Added `express-rate-limit`: a tight
  window on `POST /auth/login` (`RATE_LIMIT_LOGIN_MAX`/`_WINDOW_MS`, default 10/15min) and
  a looser one across the rest of `/api/v1` (`RATE_LIMIT_API_MAX`/`_WINDOW_MS`, default
  300/min), both configurable via env. Verified with a real request-count test
  (`apps/api/src/rate-limit.test.ts`, using a low test-only override so the test doesn't
  need to fire 10+ requests) rather than just asserting the middleware is mounted.
- **CORS was wide open (`cors()` with no options), undocumented as such.** Added
  `CORS_ORIGIN` (comma-separated allowlist; `*` — the default — reflects any origin,
  matching the prior behavior, and is dev-only). Verified with a real test
  (`apps/api/src/cors.test.ts`) that an origin outside the configured allowlist does not
  get reflected back.
- **A refresh token was issued at login but nothing ever consumed it.** `POST
  /api/v1/auth/refresh` didn't exist. Added it: verifies the refresh token, re-derives
  claims from the database (not from the token's own embedded claims, so a role change or
  deactivation since the token was issued takes effect immediately), and issues a fresh
  access/refresh pair. Refresh tokens remain stateless JWTs with no server-side revocation
  list — a real, named gap (docs/SECURITY.md), not silently claimed as solved.
- **JWT TTLs were hardcoded (`15m`/`7d`) despite `.env.example` documenting
  `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` as configurable since Phase 1.** Wired both into
  `packages/shared-config/src/env.ts` (validated against a duration-string regex) and
  through to `signAccessToken`/`signRefreshToken`. Also fixed `.env.example`'s
  `JWT_REFRESH_TTL` placeholder, which said `30d` while the actual hardcoded value had
  always been `7d`. Verified with `apps/api/src/auth/jwt.test.ts`, which decodes a signed
  token's `exp`/`iat` claims rather than just checking the function returns a string.
- **The pino log-redaction config existed but had never been exercised by a test.** Added
  `packages/shared-config/src/logger.test.ts`, which captures real emitted JSON (via a new
  optional `destination` stream parameter on `createLogger`) and asserts sensitive fields
  are actually censored — this is the same "claimed but unverified" class of gap the
  project mandate exists to catch.
- **A production process could start with every secret still at its `.env.example`
  placeholder value.** Added `assertNoInsecureDefaultsInProduction` to
  `packages/shared-config/src/env.ts`: `loadEnv()` throws at startup if `NODE_ENV
  === "production"` and any of `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/
  `WEBHOOK_SIGNING_SECRET`/`STORAGE_SECRET_KEY` is still `dev-only-change-me-*` or
  `minioadmin`. This is a fail-fast startup check, not a runtime guard — it costs nothing
  in the request path.
- **docs/SECURITY.md itself overclaimed in several places**: argon2id (actual: bcryptjs,
  per D2), "refresh tokens stored hashed" (actual: stateless, unrevoked), API-key auth for
  API clients (actual: not built, `API_CLIENT` is a defined role with nothing behind it),
  a malware-scan interface implied to be wired into an upload path (actual: no document
  upload endpoint exists to call it from). All corrected in place rather than left
  standing.
**Why:** A security document that describes a system more hardened than the one actually
running is worse than no document at all — it gives false assurance. This phase's job was
to make the real gaps either closed (rate limiting, CORS, refresh flow, TTL config,
redaction verification, secret fail-fast) or explicitly named (revocation, API keys,
malware scanning, mTLS, CI secret-scanning), never left ambiguous.

## D20: Phase 14 found the Docker daemon actually works here — and two real bugs a build would have caught
**Decision:** Every prior phase's docs (docs/REQUIREMENTS_MATRIX.md #37, PROGRESS.md)
stated no Docker daemon was available in this build sandbox, so `docker-compose.yml` and
the three Dockerfiles had only ever been code-reviewed, never built. Phase 14 found this
was half true: `dockerd` actually starts and runs here (`docker ps`/`docker info` both
work), but this sandbox's network egress allowlist blocks every container registry
(`registry-1.docker.io`, `mirror.gcr.io`, `public.ecr.aws` were all tried and all return
403 Forbidden on the base-image pull) — so a `docker build` still cannot complete here, for
a different and more specific reason than previously documented. This distinction matters:
it means the remaining gap is exactly "pull `node:20-slim` once," not "get Docker running
here at all," which is what a user running this on their own machine will not hit.
Verification that *was* possible without a completed image build found two real,
previously-undiscovered bugs by reading the Dockerfiles and compose file closely, plus
independently confirming both by running the exact same `RUN`/`CMD` commands the
Dockerfiles use directly against a real local Postgres (not inside a container, but the
identical commands and identical compiled artifacts a container would run):
1. **`Dockerfile.web`'s final stage shipped dangling symlinks.** pnpm's default
   node_modules layout is symlinks pointing back up to a root-level `.pnpm` store; the
   final stage copied only `apps/web/node_modules` (the symlinks) without the store they
   point to, which would have made `next start` fail to resolve `react`/`next` at
   container startup — a bug no prior phase could have caught without an actual build.
   Fixed by adding `output: "standalone"` to `apps/web/next.config.js` (Next.js traces and
   copies only the actually-used runtime files into a self-contained tree) and rewriting
   the final stage to copy `.next/standalone` + `.next/static` + `public` instead, then
   `CMD ["node", "apps/web/server.js"]`. Verified for real: `pnpm --filter
   @project-lien/web build` was re-run and `apps/web/.next/standalone/apps/web/server.js`
   plus a real (non-symlink) `node_modules` tree were confirmed to exist on disk.
2. **`docker-compose.yml`'s `api`/`worker` services would refuse to start under D19's new
   fail-fast check.** They set `NODE_ENV: production` (correctly, to exercise the real
   production code path) but never set `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/
   `WEBHOOK_SIGNING_SECRET`/`STORAGE_SECRET_KEY` — meaning `assertNoInsecureDefaultsInProduction`
   (D19) would throw at container startup. This is D19 working as designed against a real
   consumer of it, not a flaw in D19 — `docker-compose.yml` needed updating to supply
   distinct, non-default (still not "real") secret values, and MinIO's own credentials
   needed to move off `minioadmin` to match, since `minioadmin` is itself one of the
   flagged insecure defaults. Verified for real: booted the actual compiled
   `apps/api/dist/server.js` and `apps/worker/dist/index.js` directly with the exact env
   var values now in `docker-compose.yml` (`NODE_ENV=production` plus the new compose
   secrets) against a real local Postgres — both started cleanly and `/health`/`/ready`
   responded correctly; a second run with the *old* (insecure-default) values reproduced
   the exact startup failure this fix prevents, confirming both sides of the fix.
**Why:** These are exactly the kind of integration bug that only surfaces by actually
running the artifact a Dockerfile produces, or by reasoning carefully about what it
produces when running it isn't possible — the project mandate's "never claim something
works without verifying" applies here even though a full `docker build` couldn't be
completed. Static review plus running the identical compiled commands outside the
container was the most real verification available, and it caught genuine bugs a
docs-only review would have missed.

## D21: `pnpm test` from the repo root silently corrupted itself via a cross-package DB race
**Decision:** Every package whose tests hit real Postgres resets a shared
`project_lien_test` database in its own `beforeAll` (`DROP SCHEMA public CASCADE` +
migrate). Each package's own `vitest.config.ts` sets `fileParallelism: false` so that
package's *own* test files never race each other — but nothing prevented Turborepo from
running *different packages'* test tasks concurrently, and the root `package.json`'s
`"test": "turbo run test"` script had no concurrency limit. Every verification run in this
project's history up to this phase happened to pass `--concurrency=1` by hand (a habit
carried over from when `apps/api` and `apps/worker`'s test suites were first made to share
a database), which silently masked this: `pnpm test` — the command anyone would actually
run — was never itself tested. Phase 14 ran it for real (`pnpm test --force`, bypassing
Turbo's cache) and reproduced real failures: `apps/api` and `apps/worker`'s test processes
ran at the same time, and one package's `DROP SCHEMA public CASCADE` fired while the
other's tests were mid-run against tables that then no longer existed
(`relation "users" does not exist`, `relation "state_jurisdiction_rules" does not exist`).
**Fix:** `"test": "turbo run test --concurrency=1"` (and `"test:e2e"` to match) in the root
`package.json`, so the safe invocation is the default one rather than a convention every
future contributor and CI run would have to independently rediscover. Verified: `pnpm test
--force` re-run after the fix passes all 25 task 100% clean (125 tests across every
package). The real cost is a slower `pnpm test` (fully serial instead of parallelized
across packages) — an acceptable trade for correctness at this project's current test
suite size; a future phase could instead give each package its own dedicated test database
name to allow safe parallelism, but that's a larger change deferred rather than rushed here.
**Why:** A test command that only produces correct results when invoked with a flag no one
documented is a real, load-bearing bug in the test infrastructure itself, not a style nit —
and it was only found by actually running the plain, undocumented command a real user or a
real CI pipeline would run, rather than continuing to rely on the hand-typed flag that had
been masking it.

## D22: Dependency audit — closed a critical CVE and 15 of 37 vulnerabilities, documented the rest
**Decision:** `pnpm audit --prod` (added to CI, docs/DEPLOYMENT.md's "dependency scanning"
line item) found 37 real vulnerabilities in this build's actual dependency tree, including
one critical: a Next.js authorization-bypass-in-middleware CVE (GHSA-f82v-jwr5-mffw), live
on the `next@14.2.15` this project had been building against since Phase 1. Fixed what
could be fixed without a risky major-version jump, left the rest as a named, deliberate gap:
- **`next` bumped 14.2.15 -> 14.2.35** (latest 14.2.x patch release) — closes the critical
  bypass plus several high-severity DoS/cache-poisoning CVEs, while staying on the Next 14
  major so this doesn't force a React 19 migration or an untested App Router behavior
  change. Verified: full `pnpm --filter @project-lien/web build` re-run, all 8 existing
  routes still compile and prerender; a real `next start` process (see D20) still serves
  `/login` with a 200.
- **`kysely` bumped ^0.27.4 -> ^0.28.17 across all 6 packages that depend on it**
  (`packages/db`, `domain-escrow`, `domain-jurisdiction`, `domain-workflow`, `apps/api`,
  `apps/worker`) — closes 3 high-severity SQL/JSON-path injection CVEs. Kysely is pre-1.0,
  so a minor bump can carry breaking changes; verified for real by re-running the entire
  workspace test suite after the bump (`pnpm turbo run build test lint --concurrency=1
  --force`), which passed 44/44 tasks with zero code changes needed.
- **`postcss` (a transitive dependency Next.js itself pins to a vulnerable `8.4.31`, not
  something this project depends on directly) pinned workspace-wide to `>=8.5.23`** via a
  `pnpm.overrides` entry in the root `package.json` — closes 2 high and 2 moderate CVEs.
  Low risk: `apps/web` has no postcss/Tailwind config or CSS files of its own (confirmed by
  searching for either), so postcss here is unused dead weight bundled by Next's own build
  pipeline, not something this project's pages actually exercise.
- **Remaining ~21 `next`-related advisories require Next.js 15.x** (several need
  `>=15.0.8`, most need `>=15.5.16` or later) — a major-version migration requiring React 19
  and carrying real App Router behavior changes, which is out of scope for a hardening pass
  with no dedicated regression-testing time budgeted for it. Left as a named, tracked gap
  (this entry, plus docs/REQUIREMENTS_MATRIX.md #38) rather than either silently ignored or
  rushed in without verification.
**Why:** Closing the critical CVE and every fix reachable without a major-version jump is
real, verified security value; jumping to Next 15 without the time to actually test the
migration would trade a documented, bounded gap for an unverified, unbounded one — exactly
what this project's "never claim something works without verifying" mandate exists to
prevent. `.github/workflows/dependency-audit.yml` (weekly, non-gating) and
`.github/dependabot.yml` (weekly PRs) now watch this on an ongoing basis rather than
relying on another one-off manual pass.
