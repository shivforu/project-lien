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
- [ ] Not started

## Phase 3 — Document generation + PDF/pre-flight engine
- [ ] Not started

## Phase 4 — PRIA canonical package + XML validation
- [ ] Not started

## Phase 5 — Provider adapter framework + mock eRecording services
- [ ] Not started

## Phase 6 — Workflow orchestrator / queue / async processing
- [ ] Not started

## Phase 7 — Escrow + fee reconciliation + statutory scheduler
- [ ] Not started

## Phase 8 — REST API + OpenAPI + webhooks
- [ ] Not started

## Phase 9 — Authentication / authorization / tenant model
- [ ] Not started

## Phase 10 — Operations web application
- [ ] Not started

## Phase 11 — Exception center + audit + integration management
- [ ] Not started

## Phase 12 — Full automated testing
- [ ] Not started

## Phase 13 — Security hardening + observability
- [ ] Not started

## Phase 14 — Docker / deployment / CI
- [ ] Not started (docker-compose file itself lands in Phase 1; this phase is CI +
      production-shape hardening)

## Phase 15 — End-to-end verification and documentation
- [ ] Not started
