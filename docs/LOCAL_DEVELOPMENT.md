# Local Development

## Prerequisites
- Node.js 20+, pnpm 9+
- Docker Desktop (for Postgres + MinIO via docker-compose) — or point `DATABASE_URL` at
  any local Postgres 16 instance if you'd rather not use Docker.

## First-time setup
```bash
cp .env.example .env
pnpm install
docker compose up -d db minio
pnpm --filter @project-lien/db migrate   # hand-authored SQL migrations, not Prisma — see docs/DECISIONS.md D2
pnpm --filter @project-lien/db seed
pnpm dev            # runs api + worker + web together via turbo
```
`migrate`/`seed`/`dev`/`start` all load `.env` from the repo root automatically (Node's
`--env-file-if-exists` flag, docs/DECISIONS.md D25) — no manual `export`/`source` needed,
and nothing breaks if `.env` doesn't exist (e.g. in CI, or if you set real environment
variables another way).

## Common commands
```bash
pnpm build          # build all packages/apps
pnpm clean           # rm -rf each package's dist/.next + tsc's incremental-build cache
                      # (genuinely does this as of Phase 15 — see docs/DECISIONS.md D24;
                      # if you're on a checkout from before that fix, `git pull` first)
pnpm typecheck       # tsc --noEmit across the workspace
pnpm lint            # eslint across the workspace
pnpm test            # unit + integration tests (spins up a throwaway test DB)
pnpm test:e2e        # apps/worker's Vitest E2E scenarios (A-J, docs/TEST_STRATEGY.md)
                      # plus apps/web's Playwright suite (docs/DECISIONS.md D23), which
                      # boots the real compiled api/worker/web processes itself against a
                      # dedicated database — no docker-compose or manually-running dev
                      # servers required first
```

## Ports (default)
- `apps/web` → http://localhost:3000
- `apps/api` → http://localhost:4000 (health: `/health`, readiness: `/ready`)
- Postgres → localhost:5432
- MinIO → http://localhost:9000 (console: 9001)

## Working without Docker
On a normal developer machine, `docker compose up -d db minio` (or the full
`docker compose up`) should work fine — nothing about this codebase requires avoiding
Docker. This project's own build sandbox is a narrower case worth calling out: the Docker
*daemon* runs there without issue, but outbound pulls from container registries
(Docker Hub, GCR mirrors, ECR public) are blocked by network egress policy, so `docker
build`/`docker compose up` against upstream base images can't complete inside that
sandbox specifically (see docs/DECISIONS.md D20). Phase 14's Docker/Compose fixes were
therefore verified by running the equivalent compiled commands directly (booting
`apps/web/.next/standalone/apps/web/server.js`, `apps/api/dist/server.js`, and
`apps/worker/dist/index.js` with the exact env vars docker-compose supplies) rather than
via a full `docker compose up`, and real container builds are covered by
`.github/workflows/ci.yml`'s `docker-build` job, which runs on GitHub-hosted runners with
normal registry access. If you ever hit the same registry-blocked symptom locally (unlikely
outside a locked-down CI/sandbox network), the fallback is what this project used throughout
development: point `DATABASE_URL` at a natively-installed PostgreSQL 16 instance and run
apps directly with `pnpm dev`. Both paths stay in sync — the same migrations and the same
`.env` variables drive either setup.
