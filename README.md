# Project Lien

A next-generation eRecording and mortgage lien-release platform — a modern,
developer-first alternative to legacy eRecording systems (e.g. Simplifile), covering the
full lifecycle from payoff/lien-release initiation through document preparation,
jurisdiction compliance, pre-flight validation, PRIA packaging, electronic recording,
status tracking, escrow/fee reconciliation, statutory deadline monitoring, and audit.

**Start here:**
- `FINAL_SYSTEM_REVIEW.md` — consolidated status, requirements coverage, and known
  limitations as of the end of the last planned phase. Read this first.
- `PROGRESS.md` — current build status, phase by phase.
- `docs/ARCHITECTURE.md` — system design, lifecycle state machine, component map.
- `docs/DECISIONS.md` — every architectural decision and why (including where and why
  this diverges from the product's original requirements conversation).
- `docs/REQUIREMENTS_MATRIX.md` — every requirement, where it's implemented, and its
  current status.
- `docs/EXTERNAL_DEPENDENCIES.md` — what's mocked vs. real, and what would unblock each.
- `docs/ASSUMPTIONS.md` — gaps in the source requirements and how they were resolved.

**Important:** this is a platform for a real regulated domain (real estate recording,
escrow funds) built without production vendor credentials or licensed legal/compliance
data. Nothing here should be treated as legally authoritative or production-deployed
without the verification work described in `docs/EXTERNAL_DEPENDENCIES.md` and
`docs/SECURITY.md`. Every jurisdiction rule in the seed data is explicitly marked
`UNVERIFIED`.

## Quick start

See `docs/LOCAL_DEVELOPMENT.md` for full instructions.

```bash
cp .env.example .env
pnpm install
docker compose up -d db minio
pnpm --filter @project-lien/db migrate
pnpm --filter @project-lien/db seed
pnpm dev
```

## Repository layout

```
apps/
  api/      REST API (Express) — auth, versioned endpoints, webhooks
  worker/   Background workflow engine, polling, statutory scheduler
  web/      Operations UI (Next.js)
packages/
  db/                    Postgres schema (raw SQL migrations) + Kysely client
  domain-jurisdiction/   State/county compliance rule resolution
  domain-fees/           Recording fee calculation
  domain-documents/      Document generation + PDF pre-flight/margin engine
  domain-pria/           Canonical package model + PRIA XML + validation
  domain-workflow/       Package state machine + job queue
  domain-escrow/         Ledger, fee reconciliation, deadline monitoring
  adapters-erecording/   Vendor adapter interface + Simplifile/CSC/ePN mocks
  adapters-storage/      Document storage abstraction (MinIO/S3)
  adapters-los/          LOS/TMS connector interface + mock
  shared-types/          Cross-cutting TypeScript types
  shared-config/         Env loading, structured logging
docs/       All planning, architecture, and compliance documentation
infra/      Dockerfiles
.github/    CI (build/test/lint + Docker image builds), Dependabot, dependency audit
```

End-to-end tests live beside the code they exercise, not in a separate top-level
directory: `apps/worker/src/e2e-scenarios.test.ts` (scenarios A-J, docs/TEST_STRATEGY.md)
and `apps/web/e2e/` (a real-browser Playwright suite for the operations UI,
docs/DECISIONS.md D23). Run both with `pnpm test:e2e`.
