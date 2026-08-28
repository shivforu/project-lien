# Deployment (target production shape)

This is written ahead of Phase 14 so later infra work has a fixed target.

## Environments
`local` (docker-compose) → `staging` → `production`. Config is 100% environment
variables (see `.env.example`); no environment-specific code branches.

## Target production topology
- `apps/api` and `apps/worker` as separate deployable containers (independent scaling —
  API is request-driven, worker is queue-depth-driven).
- `apps/web` as a Next.js deployment (Vercel or containerized).
- Managed PostgreSQL (RDS/Cloud SQL/Neon) instead of the local container.
- AWS S3 + KMS instead of MinIO (`IDocumentStorage` swap only — no domain code changes).
- Real IdP (Auth0/Okta/SSO) instead of local JWT auth, behind the same auth interface.
- Secrets from a manager (AWS Secrets Manager/Vault), never baked into images.

## CI/CD (GitHub Actions, added in Phase 14)
- `ci.yml`: install → typecheck → lint → unit+integration tests (ephemeral Postgres
  service container) → build.
- `e2e.yml`: docker-compose stack → full E2E suite.
- Dependency scanning (`pnpm audit` / Dependabot) on a schedule.
- Deploy workflow gated on `ci.yml` passing; migrations run as a release step before the
  new app version receives traffic.

## Production launch checklist
See FINAL_SYSTEM_REVIEW.md (produced at the end of the build) for the concrete,
verified-against-this-codebase version of this list. Placeholders known up front:
replace every mock vendor adapter with a real credentialed one, replace UNVERIFIED
compliance rules with counsel-reviewed data per state actually being operated in,
replace local JWT auth with the org's real IdP if required, point storage at S3+KMS,
enable real TLS/mTLS, wire a real malware scanner and a real vision/OCR provider.
