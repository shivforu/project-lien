# Test Strategy

## Unit tests (per package, Vitest)
- `domain-jurisdiction`: state rule resolution, county override resolution (including
  fallback-to-state-default), theory-type → doc-type selection.
- `domain-fees`: recording fee calculation (base + per-page + cover page), edge cases
  (0-page, county-not-found fallback).
- `domain-documents`: PDF geometry math (margin transform bounds, the `yOffset` clamp
  bug fixed in DECISIONS.md D10), pre-flight rule evaluation (deterministic checks only —
  vision-provider checks are tested via its mock).
- `domain-pria`: canonical→XML construction, structural schema validation (positive and
  negative cases).
- `domain-workflow`: every valid and invalid state transition; a transition not in the
  allowed table always throws.
- `domain-escrow`: ledger operations — deposit, remit, refund, shortage-cover — always
  balance to zero drift; currency math never touches floating point (int cents only).

## Integration tests (Vitest + a real ephemeral Postgres)
- Migrations apply cleanly from empty.
- Workflow engine against real Postgres: job claiming under concurrent workers
  (`FOR UPDATE SKIP LOCKED` correctness), retry/backoff increments, dead-letter after
  max attempts.
- Vendor adapter contract tests: the same test suite runs against every
  `IErecordingProvider` implementation (mock adapters now; real adapters later must pass
  the identical suite before being trusted).
- Webhook delivery: signing, retry-with-backoff, dedup on delivery id.
- Escrow reconciliation against real transactions (`BEGIN`/`COMMIT`/`ROLLBACK` paths,
  including the `FOR UPDATE` row lock used during reconciliation).

## End-to-end tests (Vitest/Playwright against the full docker-compose stack)
Each scenario the project mandates, mapped to what actually exercises it:

| Scenario | How it's driven |
|---|---|
| A. Successful recording | API create → worker validate/preflight/package/submit → mock vendor accepts → mock county "records" → fee reconciles → COMPLETE |
| B. Pre-flight rejection | Submit a fixture PDF/metadata combo engineered to fail a deterministic pre-flight rule (e.g., missing party name) → assert `PREFLIGHT_FAILED` + no vendor call made |
| C. County rejection + resubmission | Mock adapter configured to reject once → operator applies a correction → resubmit → mock accepts → RECORDED |
| D. Vendor outage / retry | Mock adapter forced to throw/timeout N times → worker retries with backoff → succeeds on the Nth attempt within max-attempts |
| E. Duplicate webhook | Same vendor webhook payload delivered twice → second is a no-op (idempotency key on delivery), state unchanged |
| F. Duplicate submission attempt | Same idempotency key POSTed twice to `/releases/:id/submit` → second call returns the first result, no second vendor submission |
| G. Statutory deadline warning | Seed a package with a near-due deadline → scheduler job flags it `at-risk`, webhook `deadline.at_risk` fires once (not on every scheduler tick) |
| H. Fee overage/refund | Mock vendor reports actual fee < estimated → escrow ledger issues a refund transaction, balance updates |
| I. Fee shortage | Mock vendor reports actual fee > estimated → ledger records a deficit-covered transaction, package still completes |
| J. Restart mid-workflow | Kill the worker process mid-job (job left `IN_PROGRESS` past a claim-timeout) → next worker instance reclaims and completes it exactly once |

## Web UI end-to-end tests (Playwright, `apps/web/e2e/`, added Phase 15)
The scenario table above exercises the API/worker layer; it says nothing about the
operations web app itself. Through Phase 14, that layer had only ever been checked with
one-off manual Playwright scripts run by hand during Phase 10/11 and thrown away
afterward — real coverage at the time, but not repeatable or committed. Phase 15 replaced
that with `apps/web/e2e/golden-path.spec.ts`: a committed, automated suite that boots the
actual compiled api/worker/web processes against a dedicated database
(`apps/web/e2e/global-setup.ts`) and drives real headless Chromium through login → queue →
package detail → jurisdiction lookup → integrations → forcing a package to REJECTED →
resolving it in the exception center, asserting against both the rendered DOM and the
database/API state the UI is supposed to reflect. Run it with `pnpm test:e2e` (same command
as the API/worker scenarios above, via Turborepo) or `pnpm --filter @project-lien/web
test:e2e` directly; CI runs it on every push (`.github/workflows/ci.yml`).

## Coverage expectations
Domain packages (jurisdiction, fees, documents, pria, workflow, escrow) target high
line/branch coverage since they encode the rules this whole product exists to get right.
Thin controller code and the operations web app are covered by the E2E scenarios and the
Playwright suite above rather than exhaustive unit tests. Coverage is reported per-package
and tracked in PROGRESS.md as each phase lands — no phase is marked done with failing or
skipped tests.
