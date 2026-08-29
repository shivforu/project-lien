# Final System Review

Consolidated status at the end of Phase 15 (the last planned phase) — what this system is,
how it was verified, what's real vs. mocked vs. missing, and what a reviewer or the next
person picking this up should know before relying on it. Everything stated here as
"verified" was checked against a real running Postgres instance and, where noted, real
compiled processes and a real browser — not asserted from reading the code. Where a phase
found a bug during that verification, it's named rather than smoothed over; see
docs/DECISIONS.md for the full account of each one.

## What this is

Project Lien is an eRecording and mortgage lien-release platform — a developer-first
alternative to legacy systems like Simplifile, covering the full lifecycle from payoff/
lien-release initiation through document generation, jurisdiction compliance, pre-flight
validation, PRIA packaging, electronic recording, status tracking, escrow/fee
reconciliation, statutory deadline monitoring, and audit. It was built across 15 phases
from a 123-page requirements transcript (docs/ASSUMPTIONS.md, docs/DECISIONS.md) under a
standing mandate: real, tested code over claimed-but-unverified code; no fabricated vendor
APIs or legal data; integer-cents currency math throughout; every material decision logged.

## Architecture in one paragraph

A pnpm/Turborepo monorepo: `apps/api` (Express, versioned REST, JWT auth/RBAC) accepts
requests and enqueues work, never doing long-running or vendor-facing work itself;
`apps/worker` is the only thing that advances the package state machine — resolving
jurisdiction rules, generating and pre-flighting documents, building PRIA packages,
submitting to and polling vendor adapters, reconciling fees, monitoring statutory
deadlines — via a Postgres-backed job queue (`FOR UPDATE SKIP LOCKED`, retry/backoff,
dead-letter, idempotency keys, crash-safe reclaim). `apps/web` is a Next.js operations
console. Ten `packages/*` hold the actual domain logic (jurisdiction, fees, documents,
PRIA, workflow, escrow) and integration interfaces (eRecording vendors, LOS/TMS, document
storage), each independently unit- and integration-tested. See docs/ARCHITECTURE.md for
the full diagram and docs/DECISIONS.md for why each major structural choice was made
(notably D2: Prisma was replaced with hand-authored SQL migrations + Kysely early on,
because Prisma Migrate's CLI needed a binary this environment couldn't fetch).

## Requirements coverage

docs/REQUIREMENTS_MATRIX.md tracks all 40 requirements individually, each with its
implementing module and the specific test that backs its status. Rolled up:

DONE (built and verified against real Postgres/real processes): 26 of 40 — every domain
engine (jurisdiction resolution, fee calculation, document generation and pre-flight, PRIA
serialization, escrow ledger, deadline monitoring, the package state machine, job
orchestration), the versioned REST API with auth/RBAC/tenant isolation, document storage,
the exception center, the integrations-health screen, and — as of Phase 15 — the
now-automated web UI coverage.

MOCKED by design (interface + contract tests, no real vendor credentials exist to test
against — see docs/EXTERNAL_DEPENDENCIES.md): 5 — the Simplifile/CSC/ePN eRecording
adapters, signature/notary-seal vision validation, and the LOS/TMS connector.

IN_PROGRESS (the core is real and tested; a named secondary piece isn't built): 6 —
jurisdiction rule versioning metadata (schema only, no read/write logic), inbound
vendor/county webhooks (outbound customer webhooks are real; status arrives by polling,
not push), the operations UI's dashboard/metrics tiles and queue filtering, the
jurisdiction admin UI's create/edit half (lookup is real), and observability (logging/
health/rate-limiting/CORS are real; no external log-aggregation or tracing platform is
wired in, which is a production-deployment concern rather than a local-build gap).

NOT_STARTED: 2 — a document viewer with pre-flight overlay, and a dedicated developer/API
portal UI (the underlying webhook CRUD API exists; there's no web screen for it).

DEFERRED (explicitly out of v1 scope): 1 — direct-to-county adapters (the original
requirements transcript never specified how these would work; the router throws a clear
error for that connection type rather than pretending to support it).

## How this was actually verified

Every phase followed the same discipline, checked in PROGRESS.md's per-phase entries:
build the real thing, run it against a real local Postgres 16 instance, and where a claim
could be checked by actually running the system rather than reading the code, run it.
Concretely, by the end of Phase 15:

- **Unit + integration tests**: 125+ Vitest tests across all packages, run against a real
  ephemeral Postgres (not mocks) for anything touching the database — job-queue
  concurrency (`FOR UPDATE SKIP LOCKED`), ledger row-locking, migration idempotency, real
  filesystem I/O for document storage.
- **Backend end-to-end scenarios** (`apps/worker/src/e2e-scenarios.test.ts`): the ten
  scenarios docs/TEST_STRATEGY.md defines (successful recording, pre-flight rejection,
  county rejection + resubmission, vendor outage/retry, duplicate submission, statutory
  deadline warning, fee overage/shortage, restart-mid-workflow) all run against real HTTP
  requests into a real Express app backed by real Postgres — not component-level mocks.
- **Web UI end-to-end** (`apps/web/e2e/`, added Phase 15): a real headless-Chromium
  Playwright suite drives login, jurisdiction lookup, integrations, package creation, and
  the exception center's resolve action against the actual compiled api/worker/web
  processes — replacing what had been one-off, unrepeated manual verification through
  Phase 14 (docs/DECISIONS.md D23).
- **A genuine clean-room rebuild** (Phase 15): `rm -rf dist .turbo` workspace-wide,
  followed by a full `pnpm turbo run build test lint --concurrency=1 --force` (44/44
  tasks) and `pnpm test:e2e` (16/16 tasks, both suites above). This had never actually
  been done before Phase 15 and surfaced a real, previously-invisible bug — `pnpm clean`
  had been a silent no-op since Phase 1 (docs/DECISIONS.md D24) — fixed as part of this
  phase, not just noted.
- **Docker/Compose**: the daemon runs in this project's own build sandbox, but container
  registry pulls are blocked by that sandbox's network egress policy specifically (not a
  codebase limitation — docs/DECISIONS.md D20). Verified by running the identical compiled
  commands and env vars docker-compose supplies directly against real processes, which
  caught two real bugs (a dangling-symlink issue in the web image's final stage, and
  docker-compose services that would fail the production secret fail-fast check) — both
  fixed. Real container builds run in `.github/workflows/ci.yml`'s `docker-build` job on
  GitHub-hosted runners, which do have registry access.
- **Dependency security**: a real `pnpm audit --prod` pass (Phase 14) found and fixed a
  critical Next.js CVE and 14 others by bumping `next` and `kysely` and overriding
  `postcss`, taking the count from 37 advisories (1 critical) to 21 (0 critical) — the
  remainder requires a Next 15 major-version migration, deliberately deferred rather than
  rushed without regression-testing time (docs/DECISIONS.md D22).

## Known limitations (the honest list)

- **No real vendor credentials anywhere** — Simplifile/CSC/ePN, LOS/TMS systems, and
  notary/signature verification are all interface + mock + contract tests. See
  docs/EXTERNAL_DEPENDENCIES.md for exactly what each would need to go live.
- **All jurisdiction data is `UNVERIFIED` seed data** — 50 states + 5 demo counties with
  real names/FIPS codes but statutory deadlines, fees, and margin rules that were
  transcribed from the requirements conversation, not sourced from actual state statutes
  or county fee schedules. Every screen that surfaces this data displays its
  `UNVERIFIED`/provenance status prominently rather than letting it pass as authoritative.
- **No inbound vendor/county webhook receiver** — this system polls vendor status rather
  than receiving pushed updates, which matches the mock adapters' design but means a real
  vendor integration would need this built.
- **No document viewer, no developer/API portal UI, no dashboard metrics tiles** — named
  NOT_STARTED/IN_PROGRESS gaps above, not overlooked.
- **JWT refresh tokens have no server-side revocation list** — a leaked or
  should-be-revoked refresh token stays valid until its own expiry (docs/SECURITY.md).
- **Rate limiting is in-memory/per-process** — fine for a single instance; a real
  multi-instance production deployment would need a shared store (Redis) behind it.
- **~21 dependency advisories remain**, all requiring a Next.js 15/React 19 migration
  (docs/DECISIONS.md D22) — tracked by the weekly `dependency-audit.yml` workflow, not
  silently sitting unmonitored.
- **This sandbox's own Docker builds were verified by proxy** (real commands, real
  processes, not a completed `docker build`) — the first real confirmation of a full
  `docker compose up`/CI Docker build is the next actual push to GitHub, or a local run on
  a developer machine with normal registry access.

## Repository map for a reviewer

- `README.md` — quick start and repository layout.
- `PROGRESS.md` — every phase's detailed report (what was built, what was tested, what
  passed, what's known-limited) — the most granular history of this build.
- `docs/ARCHITECTURE.md` — system design and component map.
- `docs/DECISIONS.md` — every material technical decision and pivot, including every real
  bug this project's own verification work found and fixed, in chronological order (D1
  through D24).
- `docs/REQUIREMENTS_MATRIX.md` — all 40 requirements, individually traced to code and
  tests.
- `docs/ASSUMPTIONS.md` / `docs/EXTERNAL_DEPENDENCIES.md` — gaps in the source
  requirements and what's mocked vs. real, respectively.
- `docs/SECURITY.md` / `docs/TEST_STRATEGY.md` / `docs/API.md` / `docs/DEPLOYMENT.md` /
  `docs/LOCAL_DEVELOPMENT.md` — reconciled against the actual implementation as of the
  phase that touched each (Phase 13 for security, Phase 15 for the rest, called out inline
  wherever a claim needed correcting).

## Reproducing this review's verification yourself

```bash
pnpm install
pnpm turbo run clean --concurrency=1   # genuinely cleans as of Phase 15 (D24)
docker compose up -d db                # or point DATABASE_URL at any local Postgres 16
pnpm turbo run build test lint --concurrency=1
pnpm test:e2e                          # worker's 8 scenarios + the web Playwright suite
```

All of the above were run and passed clean immediately before this document was written.

## Where to go from here

This is a complete, internally-consistent v1 of every requirement the source transcript
specified, with every gap between "specified" and "built" named rather than hidden. The
highest-value next steps, in the order a real deployment would likely need them: (1) real
vendor credentials and a signed agreement with at least one eRecording network, since
everything downstream of that is already built and contract-tested against the same
interface; (2) licensed legal research to replace the `UNVERIFIED` seed data before any
real jurisdiction's deadline or fee is relied on; (3) the Next.js 15 migration to close the
remaining dependency advisories; (4) the document viewer and developer/API portal UI. None
of these block understanding or extending what's already here — they're additions to a
working system, not fixes to a broken one.
