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

## D23: Phase 15 replaced the operations web app's manual E2E verification with a committed, automated Playwright suite
**Decision:** docs/REQUIREMENTS_MATRIX.md #25-#27, #29-#30 had all been genuinely verified
at the time (Phase 10/11) with a real headless-Chromium Playwright script against a really
running stack — but that script was hand-run and thrown away, not committed, so nothing
would catch a regression in the web app on the next change. Phase 15 built
`apps/web/e2e/golden-path.spec.ts` + `apps/web/e2e/global-setup.ts` as a permanent, repeatable
replacement: global setup creates a dedicated `project_lien_e2e_web` database, runs the real
compiled migration/seed scripts against it, and spawns the real compiled `apps/api`/
`apps/worker` processes plus a real `next start` for `apps/web`, then tears all three down
and drops the database afterward. The spec drives real Chromium through the full golden path
(login, jurisdiction lookup against the real seeded CA/Los-Angeles rule, the integrations
screen, creating a package through the real API and seeing it on the real queue/detail
screens, then forcing a rejection via direct SQL — mirroring exactly how Phase 11's manual
verification did it — and confirming the exception center's real "Resolve" button really
advances the package in Postgres). `pnpm test:e2e` (already wired to `turbo run test:e2e
--concurrency=1`, D21) now runs this alongside the existing worker E2E scenarios, and
`.github/workflows/ci.yml` installs Chromium and runs it on every push.

Two real, previously-unknown bugs surfaced while building this suite (worth recording since
they'd have bitten a future contributor the same way): (1) the pinned `@playwright/test`
version range (`^1.47.0`) resolved to a release expecting a newer Chromium build than this
sandbox's pre-installed one, which would silently fail to launch — fixed by resolving an
explicit `executablePath` under `PLAYWRIGHT_BROWSERS_PATH` (mirroring the identical, already-
solved problem in `packages/domain-documents/src/pdf/renderer.ts`, D4) rather than assuming
Playwright's own version-keyed browser lookup would work; (2) spawning the web process via
`pnpm --filter @project-lien/web start` left an orphaned `next-server` process bound to its
port after a killed/failed run, because `SIGTERM` to the `pnpm` wrapper process doesn't
reliably reach the actual Next server it spawns as a grandchild — fixed by spawning Next's own
CLI entrypoint directly (a single, directly-killable child process), plus a best-effort
port-clearing step at the start of setup as a defense-in-depth measure.
**Why:** A manual verification script proves a screen worked once, for the person who ran it,
on that day. This project's whole methodology has been "verify against something real and
keep the evidence," and the operations UI was the one area where the evidence wasn't kept —
Phase 15 (end-to-end verification, the project's last phase) was the obvious place to close
that out rather than let the FINAL_SYSTEM_REVIEW.md claim UI coverage that no CI run would
ever actually re-check.

## D24: Phase 15's own clean-room re-verification found every package's `clean` script was a silent no-op
**Decision:** While proving Phase 15's new devDependency wiring (apps/web now depends on
`@project-lien/api`/`db`/`worker` purely so Turborepo's build graph rebuilds them before the
new Playwright suite runs — see D23) actually worked from a genuinely empty state, `rm -rf
dist .turbo` across the workspace plus a re-run of `pnpm test:e2e` intermittently failed with
`domain-pria`'s build unable to resolve `@project-lien/db`, even though `db`'s own build step
reported success. Root cause: `tsc`'s `--incremental` mode (set in `tsconfig.base.json`)
compares source file hashes against a `<package>/tsconfig.tsbuildinfo` file left over from an
earlier build; that file was never deleted by the manual `rm -rf dist .turbo` cleanup, so
`tsc` believed nothing had changed and skipped emitting any output at all — a genuine success
exit code with zero files written, which Turborepo then cached as "this task produces no
outputs" (with its own warning to that effect, easy to miss in the noise of an otherwise
green run). Investigating why this had never surfaced across 14 prior phases of full-clean
builds turned up the actual gap: root `package.json`'s `"clean": "turbo run clean && rm -rf
node_modules"` had been calling a `turbo` task that **no package in the entire workspace ever
defined** — every previous "clean rebuild" in this project's history was actually a `rm -rf
dist` typed by hand (which never touches `tsconfig.tsbuildinfo`), not `pnpm clean`, so this
gap was real from Phase 1 onward and simply never exercised. Fixed by adding a real `"clean":
"rm -rf dist tsconfig.tsbuildinfo"` script (`.next` too, for `apps/web`) to all 15 packages
that build; verified by running `pnpm turbo run clean --concurrency=1` (15/15 tasks executing
for real, not skipped) followed by a full `pnpm turbo run build test lint --concurrency=1
--force` from that genuinely clean state (44/44 tasks) and `pnpm test:e2e` (16/16 tasks,
including the new Playwright suite) — both green.
**Why:** A `clean` script that silently does nothing is worse than no script at all: it
looks like a safety net right up until someone actually needs one, at which point it fails
in the most confusing possible way (a "successful" build with missing output, several layers
removed from the actual cause). This is exactly the class of bug this project's "never claim
something works without actually verifying" mandate is meant to catch, and it only surfaced
because Phase 15's own verification work happened to exercise a clean-room rebuild for the
first time in the project's history.

## D25: `.env` was never actually loaded by any non-Docker command — `cp .env.example .env` had been a documented no-op since Phase 1
**Decision:** Found when a real user followed docs/LOCAL_DEVELOPMENT.md's own first-time-setup
steps on their own machine (the first time this project's setup instructions were followed by
someone other than the process that wrote them) and `pnpm --filter @project-lien/db migrate`
failed with `DATABASE_URL is required to run migrations` immediately after `cp .env.example
.env`. Root cause: nothing in the entire codebase ever loaded a `.env` file into
`process.env` for the local (non-Docker) path — `packages/db/src/migrate.ts` and `seed.ts`,
and `apps/api`/`apps/worker`'s `dev`/`start` scripts, all read `process.env.DATABASE_URL`
directly via plain `tsx`/`node` invocations with no `dotenv`, no `-r dotenv/config`, and no
`--env-file` flag anywhere. `docker-compose.yml` was never affected (Compose passes
environment values directly in its own YAML, not via dotenv-loading application code), which
is exactly why this had never been caught by any of this project's own extensive Docker-path
verification (docs/DECISIONS.md D20) — only the non-Docker `pnpm dev`/`migrate`/`seed` path
was broken, and every verification run in this project's history up to this point had either
used Docker or set `DATABASE_URL` explicitly on the command line (as the vitest configs and
`apps/web/e2e/global-setup.ts` still correctly do — those were never affected either).
Fixed with Node 20.6+/22's native `--env-file-if-exists=../../.env` flag (verified present in
the pinned `tsx@^4.19.0`, which forwards it to the underlying Node runtime) added to
`packages/db`'s `migrate`/`seed` scripts and `apps/api`/`apps/worker`'s `dev`/`start`
scripts — no new dependency needed. Chose `--env-file-if-exists` specifically over
`--env-file` so a missing `.env` (true of every CI run, and of anyone who sets real
environment variables another way) degrades to "continuing without it" rather than a hard
failure. Verified for real: a fresh `.env` copied from `.env.example`, `migrate`+`seed` run
successfully against a real Postgres with zero manual exports; `apps/api`'s compiled server
booted and answered a real `/health` 200 using only the `.env` file's `DATABASE_URL`; then,
separately, the `.env` file removed entirely and the same server booted cleanly using an
explicitly-set `DATABASE_URL`, confirming CI (which never creates a `.env`) is unaffected by
this change either way.
**Why:** A setup guide that was never actually followed end-to-end by anyone outside the
process that wrote it is exactly the kind of unverified claim this project's mandate exists
to prevent — and this one only surfaced once a real person ran the real documented steps on
a real machine, which is the whole reason external verification matters even after 15 phases
of internal self-verification.

## D26: Postgres's host-side port moved from 5432 to 5433, and `project_lien_test`/`project_lien_e2e_web` are now auto-created on first container init

**Decision:** Found immediately after D25, while the same real user continued through
docs/LOCAL_DEVELOPMENT.md's first-time setup on their own machine. Two independent, genuine
bugs surfaced together:

1. **Port conflict.** `docker compose up -d db minio` intermittently failed with "port is
   already allocated," and a subsequent `pnpm --filter @project-lien/db migrate` failed with
   a blank `[migrate] Failed: ` (see below) or, once, `password authentication failed for
   user "postgres"` after a stale volume was reused against a fresh container. Diagnosed
   live via `docker compose ps`, `lsof -iTCP:5432 -sTCP:LISTEN`, and `docker ps` across all
   of the user's local projects — the user then shared a Docker Desktop screenshot showing
   an entirely unrelated project ("metinc") also mapping a Postgres container to host port
   5432, currently stopped. A stopped container can still leave Docker Desktop's port-
   forwarding proxy in an inconsistent reservation state on macOS, which is exactly what
   made a plain port collision look like a credentials problem one moment and a connection
   refusal the next. Offered the user a choice — retry as-is (this project's own container
   was in fact the one bound to 5432 at that moment) or remap permanently to avoid the
   recurring collision — and the user chose to remap permanently. `docker-compose.yml`'s
   `db` service now maps host port **5433** to the container's internal 5432
   (`"5433:5432"`); the container's own internal port is untouched, so `migrate`/`api`/
   `worker`'s Docker-network connections to `db:5432` needed no change at all — only
   host-reachable connection strings (`.env.example`, test/vitest configs referencing
   `localhost:5432`, `apps/web/e2e/global-setup.ts`) were updated to `localhost:5433`.
   `.github/workflows/ci.yml`'s own Postgres service container deliberately keeps plain
   5432 — it's an isolated, single-purpose container per CI run with no other Postgres on
   the same host, so it was never at risk and remapping it would only add noise.

2. **Missing test databases.** While tracing the port issue, grepping the whole codebase
   for `CREATE DATABASE`/`createdb` turned up nothing — `project_lien_test` (needed by
   `pnpm test`) had never been created by anything in this project outside of a one-time
   manual `createdb` run early in the original 15-phase build session, which had simply
   persisted in that sandbox's own Postgres for the rest of the session without ever being
   verified as part of a genuine fresh setup. `docker-compose.yml`'s `POSTGRES_DB` env var
   only creates one database (`project_lien`) on first init. Fixed with a new
   `infra/docker/postgres-init/01-create-test-db.sql`, mounted read-only into the `db`
   service's `/docker-entrypoint-initdb.d/` — Postgres's official image runs every
   `.sql`/`.sh` file there, in filename order, exactly once, only against a fresh data
   volume — creating both `project_lien_test` and `project_lien_e2e_web` alongside
   `project_lien` so a first-time `docker compose up -d db minio` is now actually
   sufficient to run the whole local test suite, not only `pnpm dev`. CI is unaffected —
   its Postgres service container sets `POSTGRES_DB: project_lien_test` directly and never
   goes through this init-script path.

   A third, smaller bug was found and fixed in the same debugging session: the earlier
   blank `[migrate] Failed: ` (no message after the colon) came from `migrate.ts`'s catch
   handler logging only `err.message` — a multi-address connection refusal (`localhost`
   resolving to both `::1` and `127.0.0.1`, both refused) comes back from Node as an
   `AggregateError`, whose `.message` is empty by default. Fixed by logging the full `err`
   object instead (`seed.ts` already did this correctly and needed no change).
**Why:** Applying a new volume mount or `POSTGRES_DB`-adjacent init script only takes
effect against a *fresh* Postgres data volume — anyone already on a checkout from before
this decision needs `docker compose down -v` (not just `up`) once to pick up both fixes,
which is why this is called out explicitly rather than left to be discovered as a fourth
confusing failure. Both bugs share the same root cause as D25: this project's local setup
path had 15 phases of rigorous internal self-verification but had never actually been run,
start to finish, by anyone other than the process that wrote it — external verification by
a real user on a real machine is what caught all three issues in this pair of decisions.

## D27: `pnpm dev` crashed api and worker with `MODULE_NOT_FOUND` on a genuinely fresh clone — internal workspace packages were never built first

**Decision:** Found immediately after D26, on the very next step of the same real user's
setup: with the port and test-database issues fixed, `pnpm dev` still failed — `api` and
`worker` both crashed instantly with `Error: Cannot find module
'.../node_modules/@project-lien/shared-config/dist/index.js'`, while `web` started up fine,
which made the browser-side symptom look unrelated (`net::ERR_CONNECTION_REFUSED` on
`/api/v1/auth/login`, initially mistaken for a CORS issue — it wasn't; a CORS failure still
gets a response for the browser to block, while `ERR_CONNECTION_REFUSED` means nothing was
listening on port 4000 at all, i.e. the api process had already died). Root cause: `api`
and `worker` both depend on several internal workspace packages (`@project-lien/db`,
`shared-config`, the `domain-*` packages, `adapters-erecording`, ...) via each one's
`"main": "dist/index.js"` — a real, compiled JS entry point, not TypeScript source — but
`turbo.json`'s `dev` task had no `dependsOn`, so `pnpm dev` never built any of them first.
This had never surfaced before because every environment this project had been developed
and verified in up to this point already had `dist/` populated from an earlier `pnpm build`
or `pnpm test` run in the same long-lived checkout — a truly fresh clone (`pnpm install`
followed immediately by `pnpm dev`, exactly as docs/LOCAL_DEVELOPMENT.md's first-time setup
describes) had never actually been exercised. `web` was never affected because Next.js's
dev server talks to the API over plain HTTP rather than importing any of these packages
directly, which is exactly what let it start cleanly and mask the other two processes'
crash. Fixed by adding `"dependsOn": ["^build"]` to `turbo.json`'s `dev` task — this builds
only a package's upstream dependencies before its own dev process starts, so `tsx watch`'s
and `next dev`'s live-reload of api/web/worker's *own* source is untouched; editing a
dependency package's source during a `pnpm dev` session still requires re-running `pnpm
build` for that package, same as before.
**Why:** Verified by simulating a genuinely fresh clone for the first time in this
project's history: `rm -rf` every package's `dist/` and Next's `.next/` plus turbo's own
cache (not `pnpm clean`, which — also newly documented here — additionally does `rm -rf`
the root `node_modules`, requiring a full `pnpm install` to recover from, which is how this
was discovered), then `pnpm dev` from that state. Before the fix: `api`/`worker` crashed
with `MODULE_NOT_FOUND` in seconds. After: turbo's log showed `@project-lien/db:build`,
`shared-config:build`, and every other internal dependency building first, followed by
`api listening` on port 4000 and `worker starting`, confirmed via `lsof -iTCP:4000
-sTCP:LISTEN` actually showing a listener. Full `pnpm typecheck` (27/27) and `pnpm test`
(26/26) re-run clean afterward. Same underlying lesson as D25/D26: three real, previously
invisible setup bugs, found back to back, only because one real user finally ran this
project's own documented instructions end to end on a machine that had never run them
before.

## D28: `tsc`'s own incremental cache (`composite`/`tsconfig.tsbuildinfo`) could silently skip emitting a package's `dist/` output entirely — removed `composite`, since nothing here uses TS project references anyway

**Decision:** Found immediately after D27, on the very next `pnpm dev` the same real user
ran with that fix applied: `@project-lien/adapters-erecording` (and other packages
importing `@project-lien/db`) failed to build with `TS7016: Could not find a declaration
file for module '@project-lien/db'` — but critically, `.../packages/db/dist/index.js`
*did* exist; only `dist/index.d.ts` was missing. Reproduced directly in this project's own
sandbox by deleting a package's `dist/` while leaving its `tsconfig.tsbuildinfo` in place
and re-running `tsc -p tsconfig.json`: it exited `0` and wrote nothing at all, `dist/`
included — confirmed by first reproducing the milder symptom (declaration-only gap) and
then the full one (nothing emitted, `TS2307: Cannot find module` instead). Root cause:
`tsconfig.base.json` set `"composite": true`, which TypeScript documents as always implying
incremental compilation — `tsc` writes a `tsconfig.tsbuildinfo` recording source-file
hashes and, on a later invocation, trusts that file completely: it checks whether sources
changed, never whether the *output files it's supposed to produce still exist on disk*. A
`dist/` deleted (or partially deleted) without its matching `tsconfig.tsbuildinfo` — a
plain `rm -rf dist`, an interrupted build, any path other than this repo's own `clean`
script, which has always removed both together — leaves `tsc` confidently wrong about its
own state. `composite` was never buying anything here in the first place: it exists in
TypeScript specifically to support multi-project *project reference* builds (`tsc -b`), and
a grep across every `tsconfig.json` in the repo for a `"references"` array turned up
nothing — this project has never used that feature. Worse, this is a fundamentally bad mix
with Turborepo specifically: Turborepo layers its own "skip this task if inputs are
unchanged" cache on top, with no visibility into (or way to invalidate) tsc's separate,
independent incremental cache — two caching layers that can silently disagree about whether
a package's dist/ is real. Removed `composite` from `tsconfig.base.json` entirely;
`declaration`/`declarationMap`/`sourceMap` (the actually-used output) don't depend on it.
**Why:** Verified for real, twice. First, the exact corruption path: deleted only
`packages/db/dist/` while leaving `tsconfig.tsbuildinfo` in place, ran `npx tsc -p
tsconfig.json` directly — before this fix, exit `0` with nothing written; after removing
`composite`, no `tsconfig.tsbuildinfo` is ever written at all, so `tsc` has nothing stale to
trust and always regenerates `dist/index.js`+`dist/index.d.ts` from scratch. Second, a full
simulated-fresh-clone rebuild (every `dist/` and every `tsconfig.tsbuildinfo` deleted,
`.turbo`'s cache cleared): `pnpm build` (15/15), `pnpm typecheck` (27/27), `pnpm test`
(26/26), and `pnpm dev` all passed clean, with the api and worker processes actually
listening/running rather than crashing. This is the third real, previously invisible local-
setup bug this same real user's from-scratch run surfaced back to back with D26 and D27 —
by this point a clear pattern: this project's mandate to verify everything for real caught
everything *within* each phase's own scope, but "a brand new clone, on a machine that has
never touched this repo before, running only the documented commands" was a scope no phase
had ever actually been in.

## D29: Turborepo's cache didn't know `tsconfig.base.json` affects every package's build — the D28 fix appeared not to work because turbo kept replaying the pre-fix, still-broken cached output

**Decision:** Found when the same real user pulled the D28 fix (removing `composite` from
`tsconfig.base.json`), ran the exact clean-and-rebuild steps given to them, and hit the
*identical* `TS7016: Could not find a declaration file for module '@project-lien/db'` error
again, unchanged. Reproduced directly: with a fully valid build in place, appending a
trivial comment to `tsconfig.base.json` and re-running `pnpm build` still printed `Cached:
15 cached, 15 total ... >>> FULL TURBO` — every single package, including ones that
`import` from `@project-lien/db` and would need to see its fixed output, was served
straight from cache with `tsc` never invoked at all. Root cause: Turborepo's default task
input hashing only considers files inside that task's own package directory (plus the
lockfile and any env vars a task explicitly declares) — it has no built-in way to know a
`"extends": "../../tsconfig.base.json"` reference in a package's own `tsconfig.json` means
changes to that shared root-level file should invalidate the task's cache too. So D28's
fix was completely correct as *source code*, but on any machine holding a cache entry from
before D28 (which, on this real user's machine, had captured the still-broken output — a
`dist/index.js` with no matching `dist/index.d.ts`, from the D27/D28 investigation itself),
`pnpm build` kept silently replaying that stale, already-broken artifact indefinitely,
making the fix look like it had done nothing at all. Fixed by adding `"globalDependencies":
["tsconfig.base.json"]` to `turbo.json` — this tells turbo to fold that file's content hash
into *every* task's cache key, so any future edit to it (this one included) correctly busts
every cached build across the whole monorepo, once.
**Why:** Verified with the same before/after technique used to find the bug: with a valid
build cached, editing `tsconfig.base.json` before this fix produced a `FULL TURBO` cache
hit (proving the staleness bug); after adding `globalDependencies`, the identical edit
produced `Cached: 0 cached, 15 total` (every package correctly rebuilt); reverting the edit
back to its committed content then correctly restored `FULL TURBO` again, confirming this
doesn't just brute-force-disable caching — it hashes the file's actual content, exactly as
intended. `pnpm typecheck` (27/27) and `pnpm test` (26/26) re-ran clean afterward. This is
the fourth real, previously invisible local-setup bug this one real user's fresh-clone
attempt surfaced, and the second in a row (with D28) that only existed because two
independent caching layers — Turborepo's and TypeScript's own incremental compiler cache —
didn't know about each other's assumptions. Anyone maintaining this repo should treat
`tsconfig.base.json` (and any other file a per-package config `extends`, references, or
otherwise depends on outside its own directory) as needing a `globalDependencies` entry the
moment it's introduced, not after a second real user rediscovers the same failure mode.

## D30: seed data never created a single recording package — Queue and Exceptions were empty for every real user, always

**Decision:** Found once the same real user finally got the app running end to end (past
D25–D29) and logged in: Queue and Exceptions were both empty. `packages/db/src/seed.ts`
had always created the demo org, the demo login, all 50 states' jurisdiction rules, and the
mock integration connections — but never a single row in `recording_packages`, `loans`, or
`properties`. This had never been visible before because every automated test builds its
own fixtures directly (`apps/worker/src/e2e-scenarios.test.ts` and friends insert exactly
the rows each scenario needs), so nothing in this project's own test suite ever exercised
"log in as the seeded demo user and look at the seeded demo data" — the one thing a manual
tester or a product demo actually does. Added 5 static demo packages to `seed.ts`, one per
already-seeded demo county, deliberately spanning the statuses the UI branches on: `COMPLETE`
(CA — full happy path, recorded with a fee charged), `COUNTY_PROCESSING` (TX — in flight,
paired with one seeded `DEAD_LETTER` job so the Exceptions page's job-exceptions half has
content too), `REJECTED` (FL), `RESUBMISSION_REQUIRED` (NY — both populate the Exceptions
page's package-exceptions half), and `DRAFT` (GA — not yet submitted). Each row's
`statutory_deadline` is computed from a real settlement date using the same calendar-day
arithmetic as `calculateStatutoryDeadline` (not imported from `@project-lien/domain-jurisdiction`
directly — that package already depends on `@project-lien/db`, so the reverse import would
create a cycle Turborepo's `^build` graph can't resolve). These rows are deliberately static
inserts, not run through `assertTransition`/the job queue/vendor adapters — they exist to
give a manual tester or a demo something realistic to click through, not to simulate a real
workflow run; anyone verifying actual state-machine *behavior* still needs the e2e scenario
suite, which remains the only place packages are driven through real transitions.
**Why:** Verified for real: seeded against a live Postgres, confirmed all 5
`recording_packages` rows, their `properties`/`loans`, and the one `DEAD_LETTER`
`workflow_jobs` row landed with the expected values; re-ran the seed a second time and
confirmed row counts stayed identical (idempotent, matching every other upsert in this
file); ran the exact queries `GET /api/v1/exceptions` executes directly against the seeded
data and confirmed they return precisely the 2 exception packages and 1 dead-lettered job
expected. Full `pnpm lint` and `pnpm test` (26/26) re-ran clean afterward. `docs/QE_QUICKSTART.md`
updated to describe the 5 seeded packages instead of warning that Queue/Exceptions start
empty. This is the fifth real gap this one real user's from-scratch run has surfaced
(D25–D29 got the app running at all; this is the first one about the running app's actual
content) — every prior gap was "can I even start this," and this is the first "now that it's
running, does it look like anything," which turned out to be just as untested.

## D31: seeded OPERATOR and VIEWER demo logins, so role enforcement is actually testable without writing SQL

**Decision:** The seed data has only ever created one user — the ORG_ADMIN demo login —
even though the API defines and enforces four roles (`org_role`: `ORG_ADMIN`, `OPERATOR`,
`VIEWER`, `API_CLIENT`) and every write endpoint is gated by `requireRole` (`POST
/releases`, `/releases/:id/{preflight,submit,resubmit,cancel}`, and
`/exceptions/:id/resolve` all require `ORG_ADMIN` or `OPERATOR`; `GET /audit-events`
requires `ORG_ADMIN` specifically). With only one seeded account, that whole permission
model was untestable through the UI or a real login — the only way to see it was to read
the route source. Added `operator@demo-title-escrow.example` (`OPERATOR`) and
`viewer@demo-title-escrow.example` (`VIEWER`), both password `password123`, same bcrypt
hash as the existing admin login (bcrypt hashes verify on password alone, independent of
the associated email — confirmed directly with `bcryptjs.compareSync` before relying on
that rather than assuming it).
**Why:** Verified live, not just by reading the role-check code: seeded both accounts,
started the compiled API against a real Postgres, logged in as each over HTTP, and hit real
endpoints with the resulting tokens. Operator: `GET /audit-events` → `403`; `GET /releases`
→ `200`; `POST /releases` with an intentionally invalid body → `400` (not `403` —
confirming the request passed the role check and reached real validation, not that the
route happened to be misconfigured wide open). Viewer: `GET /releases` → `200`; `POST
/releases` → `403`; `POST /exceptions/:id/resolve` on a real seeded exception package →
`403`. Every one of those matched what the route source claims before this was ever run for
real. `pnpm lint` and `pnpm test` (26/26) re-ran clean afterward, and reseeding a third time
confirmed still exactly 3 users / 1 per role (idempotent, same pattern as every other seed
upsert). `docs/QE_QUICKSTART.md` updated with all three logins and a "log in as Viewer and
confirm the API itself rejects a write" test suggestion — deliberately phrased to check
server-side enforcement rather than only whether the UI hides a button, since the latter is
not a security boundary.

## D32: the nav bar never showed who was logged in, or offered a way to log out — `clearSession()` existed but was called nowhere in the app

**Decision:** `apps/web/lib/api-client.ts` has had a working `clearSession()` since the
session module was written, but no page or component ever called it — the nav bar
(`apps/web/app/layout.tsx`) rendered a static, unconditional `<a href="/login">Login</a>`
regardless of whether a session existed, so a logged-in user had no on-screen indication
they were logged in, which role they held, or any way to sign out short of manually
clearing browser storage. Added a client component, `apps/web/app/session-status.tsx`,
that reads `getSession()` on mount and renders either the signed-in user's email + role
with a "Log out" button, or a "Login" link when signed out; wired it into the nav bar in
place of the static link. Session state lives in `localStorage`, not React context or a
server session (a deliberate v1 simplification, see the doc comment atop `api-client.ts`),
so nothing tells an already-mounted component that a login or logout just happened — the
native `storage` event only fires in *other* tabs, never the one that made the write. Added
a small custom `SESSION_CHANGED_EVENT`, dispatched from both `saveSession()` and
`clearSession()`, that `session-status.tsx` listens for alongside `storage`, so the nav
updates immediately in the same tab (right after `/login` redirects to `/queue`) as well as
in other open tabs.
**Why:** Verified live against the running dev stack (api + web, real Postgres, no mocks),
not just by reading the diff: scripted a real browser (Playwright, headless Chromium)
through the actual flow — loaded `/login` and confirmed the nav read plain "Login"; logged
in as the seeded operator and confirmed the nav immediately showed
`operator@demo-title-escrow.example (OPERATOR)` plus a "Log out" button, with no page
reload; reloaded the page and confirmed the same state survived (session read fresh from
`localStorage` on mount, not held only in memory); clicked "Log out" and confirmed it
redirected to `/login`, the nav reverted to plain "Login", and `localStorage`'s
`project-lien-session` key was actually gone, not just visually hidden. `pnpm typecheck`
and `pnpm lint` (`apps/web`) both clean. No API or schema changes — this is web-only.

## D33: rewrote `docs/QE_QUICKSTART.md` into a complete system reference, since the outsourced QE has no other context — surfaced two previously-undocumented gaps in the process

**Decision:** The QE quickstart had grown incrementally (what the system is, how to log in,
a page/package table) but never covered the full lifecycle, every API endpoint, every
background job, or an honest account of what's built versus not — insufficient for handing
this system to a third-party QE team with zero other context. Rewrote it end to end,
verifying every claim against the actual running source rather than restating other docs
from memory: the 17-state machine (`packages/domain-workflow/src/state-machine.ts`), all 9
API route files, all 5 worker job handlers, all 6 web pages (confirmed there are exactly 3
interactive elements in the entire UI — login, the Exceptions page's two buttons, and the
Jurisdictions lookup form), the 4 roles' enforcement (`requireRole` middleware), and
`docs/EXTERNAL_DEPENDENCIES.md`'s real-vs-mock table.
That verification surfaced two gaps nobody had written down before: (1) `runPreflight` is
always called with `trusteeName: null` and `witnessNames: []` hardcoded
(`apps/api/src/routes/package-actions.ts`, `apps/worker/src/handlers/submit-package.ts`) —
there is no field anywhere to set either, so any package in one of the ~13 seeded states
with `trusteeRequired: true` (including California) will *always* fail pre-flight with
`TRUSTEE_MISSING`, permanently, confirmed by cross-referencing every seeded state's
`trusteeRequired` flag against `packages/adapters-erecording`'s test-only "TR" jurisdiction,
which exists specifically to test this rejection path (Scenario B) rather than as a bug; and
(2) a package whose county resolves to the `MANUAL` eRecording network (Fulton County, GA —
one of the 5 seeded counties) will dead-letter permanently and non-recoverably at submission,
since `erecordingRouter.resolve("MANUAL")` throws synchronously
(`packages/adapters-erecording/src/router.ts`, confirmed via its own test asserting exactly
this) and nothing catches it in `submit-package.ts` before the job queue's generic retry
mechanism takes over and exhausts retries identically every time.
**Why:** An outsourced tester with no other context, hitting either of these organically,
would burn real time treating a known, tracked limitation as a mystery bug — or filing one
against `docs/REQUIREMENTS_MATRIX.md` items already covering it (#28 for the missing
signature/notary capture, #16 for deferred direct-to-county networks). Documenting them
plainly, plus giving exact reusable seeded loan/property UUIDs (since `POST /releases` has
no way to create a loan or property, and the ID naming pattern needed hand-verifying byte by
byte — `node -e` confirmed all five are valid 36-character UUIDs before publishing them) and
a concrete curl-based recipe for exercising submission → completion despite the
signature/notary gap, turns "go figure this system out" into a document that answers what a
tester will actually run into. Verified every table entry (trustee flags, deadlines, county
networks, role/endpoint pairings) against the seed/source files directly rather than
transcribing from `docs/ARCHITECTURE.md`/`docs/API.md`, since those are drafts and had
already drifted from the real mount paths and implemented routes earlier in this project.

## D34: added a dev/test-only `advance-to-ready-to-submit` endpoint, so the full 17-state lifecycle can actually be exercised by a human, not just read about

**Decision:** D33 documented that nothing in this codebase ever performs
`READY -> PENDING_SIGNATURE -> PENDING_NOTARY -> READY_TO_SUBMIT` — signature/notary capture
was never built — which meant the *only* way anyone had ever seen a package reach
SUBMITTING/SUBMITTED/RECORDED/COMPLETE for real was reading the automated test suite's own
database-writing test helper, `advanceToReadyToSubmit()`. Asked directly by the project
owner how to test all 17 states, rather than pointing back at the test suite again, added a
real, callable version of that same shortcut: `POST
/api/v1/releases/:id/advance-to-ready-to-submit` under a new dedicated router mounted at
`/api/v1/dev` (`apps/api/src/routes/dev-tools.ts`). It only starts from status READY, walks
the three real (legal, `assertTransition`-checked) hops one at a time, and requires
ORG_ADMIN. Two things keep it from ever being mistaken for a real feature: the whole `/dev`
router 404s outright when `NODE_ENV=production` (checked in the router's own first
middleware, before auth even runs), and every transition it writes to `workflow_events` uses
`actor = 'DEV_TOOL'` with a reason stating plainly that no real signature or notarization
happened — distinct from every other actor value in this codebase (`USER`, `SYSTEM`) so the
audit trail never lies about what occurred. Deliberately left out of `docs/API.md`'s target
endpoint list, since that file documents the real customer-facing surface and this isn't
part of it.
**Why:** Verified live end-to-end against the running dev stack (real API, real worker, real
Postgres, no shortcuts in the verification itself): created a new package on the seeded
Texas loan/property (`QE-LIVE-TEST-001`, trustee not required), ran real `/preflight`
(passed, reached READY), confirmed `/submit` still correctly 409s at that point, called the
new endpoint (reached READY_TO_SUBMIT), then called real `/submit` and watched the real
worker carry it through SUBMITTING → SUBMITTED → COUNTY_PROCESSING → RECORDED → RECONCILING
→ COMPLETE unassisted in about 40 seconds. Queried `workflow_events` directly afterward and
confirmed exactly three `DEV_TOOL`-actor rows sandwiched between real `USER` rows (package
creation, pre-flight) and real `SYSTEM` rows (everything from submission onward) — the
audit trail is honest about exactly what did and didn't really happen. Separately confirmed
the safety rails: built and ran the compiled API with `NODE_ENV=production` and real
(non-default) secrets — the dev endpoint 404s while every real endpoint still works — and
confirmed OPERATOR and VIEWER tokens both get 403 from the endpoint even outside production.
Added unit tests for the production gate in isolation (`apps/api/src/routes/dev-tools.test.ts`,
a stub `db` since the gate must short-circuit before touching it) and full integration
coverage in `apps/api/src/routes.test.ts` (role check, the 409-when-not-READY case, and the
full walk plus a real `/submit` call proving the resulting status is genuinely usable, not
just cosmetically correct). `pnpm typecheck`/`lint`/`test` all clean (40/40 API tests
passing). `docs/QE_QUICKSTART.md` updated: section 4 points here instead of just naming the
gap, section 6's endpoint table calls it out as deliberately excluded from the real surface,
and section 11's walkthrough was rewritten around the actual verified run above (replacing
the previous "ask engineering to hand-edit the database" instruction) with real timing
(~40s) instead of an estimated range.
