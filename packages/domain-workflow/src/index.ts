/**
 * Package lifecycle state machine + DB-backed job queue (claim/retry/backoff/dead-
 * letter/idempotency). Implements docs/REQUIREMENTS_MATRIX.md items #20-23.
 * See docs/DECISIONS.md D3 for why this is a Postgres-backed queue rather than Temporal,
 * and docs/ARCHITECTURE.md for the full transition diagram.
 * Built out in Phase 6 — see PROGRESS.md.
 */
export const PACKAGE_NAME = "@project-lien/domain-workflow";

export * from "./state-machine.js";
export * from "./backoff.js";
export * from "./job-queue.js";
export * from "./webhook-dispatch.js";
