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
pnpm --filter @project-lien/db prisma migrate deploy
pnpm --filter @project-lien/db seed
pnpm dev            # runs api + worker + web together via turbo
```

## Common commands
```bash
pnpm build          # build all packages/apps
pnpm typecheck       # tsc --noEmit across the workspace
pnpm lint            # eslint across the workspace
pnpm test            # unit + integration tests (spins up a throwaway test DB)
pnpm test:e2e        # full docker-compose stack + Playwright/Vitest E2E scenarios
```

## Ports (default)
- `apps/web` → http://localhost:3000
- `apps/api` → http://localhost:4000 (health: `/health`, readiness: `/ready`)
- Postgres → localhost:5432
- MinIO → http://localhost:9000 (console: 9001)

## Working without Docker
This document is being built in a sandboxed environment without a Docker daemon
available, so during development we verify against a natively-installed PostgreSQL
instance and run apps directly with `pnpm dev` rather than through containers. Both paths
stay in sync: the same Prisma schema/migrations and the same `.env` variables drive
either setup — Docker is for convenience, not a hard dependency of the codebase.
