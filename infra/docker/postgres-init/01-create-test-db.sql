-- Runs automatically on the db container's first initialization (mounted into
-- /docker-entrypoint-initdb.d/ by docker-compose.yml — Postgres's own official image
-- runs every .sql/.sh file there, in filename order, exactly once, only against a fresh
-- data volume). POSTGRES_DB only creates one database (project_lien, for local dev); this
-- creates the second one `pnpm test`/`pnpm test:e2e` need (project_lien_test,
-- project_lien_e2e_web) so a first-time `docker compose up -d db minio` is actually
-- sufficient to run the whole local test suite, not just `pnpm dev`.
--
-- Previously nothing created these databases anywhere in this project — a real user's
-- first-time setup surfaced it (docs/DECISIONS.md D26). CI is unaffected: its Postgres
-- service container sets POSTGRES_DB: project_lien_test directly instead, since CI only
-- ever needs that one.
CREATE DATABASE project_lien_test;
CREATE DATABASE project_lien_e2e_web;
