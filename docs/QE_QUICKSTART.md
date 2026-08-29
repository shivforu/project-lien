# Project Lien — QE Quickstart

This is the one document you need before you start testing. It explains what the system
does, how to get in, exactly what you can click versus what only exists as an API call,
every background job that runs on its own, what's real versus faked, and — importantly —
the gaps that are *expected* today, so you don't spend an afternoon filing a bug against a
feature that was never built. Nothing here is cherry-picked: if something doesn't work yet,
it's written down below, not hidden.

## 1. What this actually is (the simple version)

When someone pays off their mortgage, the bank has to tell the county government "this
person doesn't owe us money on this house anymore" — officially, on paper, filed at the
county recorder's office. Until that filing happens, the county's records still show a lien
against the house, which can block the owner from selling it or refinancing.

Project Lien is the software a title/escrow company uses to get that paperwork done, tracked,
and filed electronically. Think of it as a mini assembly line for one document per payoff:

1. Prepare the release document (the right form for that state, e.g. "Satisfaction of
   Mortgage" or "Deed of Reconveyance").
2. Check it against that state/county's filing rules (margins, whether a trustee needs to
   sign, how many witnesses are required).
3. Submit it electronically to the county's recording system.
4. Watch it move through the county's process until it's officially recorded (or bounced
   back for a fix).
5. Reconcile the recording fee — did the county charge what was estimated, more, or less?
6. Keep an audit trail of everything, and warn someone if a state's legal deadline for
   filing is about to be missed.

This build is a demo/dev version: there is no real county connection, no real bank, and no
real notary. Every external system is a mock standing in for the real thing (see section 9).
The workflow logic, state tracking, and audit trail are real; the outside world is not.

## 2. The three programs that make this work

- **The web console** (what you'll click around in) — a read-mostly operations dashboard.
- **The API** — the actual brain; every write goes through it, and it enforces who's allowed
  to do what.
- **The worker** — a background process with no UI of its own. It's what actually submits
  packages to vendors, polls for status updates, reconciles fees, and watches deadlines. It
  runs on a timer, not on demand — nobody clicks a button to make the worker do its job.

All three need to be running for anything to work. Ask engineering to start them with
`pnpm dev` (web: **http://localhost:3000**, API: http://localhost:4000 — you generally won't
call the API directly except where this doc tells you to, since several real actions in this
build only exist as API calls, not buttons).

## 3. How to get in

Log in at **http://localhost:3000/login**. Three seeded accounts exist, all password
**`password123`**:

| Email | Role | Can do |
|---|---|---|
| `admin@demo-title-escrow.example` | ORG_ADMIN | Everything, including the audit log. |
| `operator@demo-title-escrow.example` | OPERATOR | The day-to-day work — create/submit/resubmit/cancel packages, resolve exceptions — but can't view the audit log. |
| `viewer@demo-title-escrow.example` | VIEWER | Read-only. Every write action is rejected by the API even if a button doesn't visibly disable itself. |

All three belong to the same seeded organization ("Demo Title & Escrow Co.") and see the
same data — only what they're allowed to *do* differs. That makes this a good way to confirm
role enforcement actually works on the server, not just that the UI hides a button.

Once logged in, the top-right of the nav bar shows who you are and your role
(`you@example.com (OPERATOR)`) with a **Log out** button — that's real now; it wasn't in
earlier builds. A session lasts 15 minutes (the access token's expiry) and there is **no
automatic renewal** wired into the web app — if you sit idle past 15 minutes and then click
something, expect a failed request, not a bug. Log out and back in. Session state lives in
your browser's local storage, not a server-side session, so it survives a page refresh but
not a "clear browser data."

A fourth role, `API_CLIENT`, exists in the system (you'll see it in role-check code and
docs) but has no seeded login and no way to authenticate today — there's no API-key flow
built yet, only the same email/password login everyone else uses. You can't test it; that's
expected, not something to report.

## 4. The package lifecycle — all 17 states, and the one big gap

Every "package" (one document, one payoff) moves through a fixed state machine. This is the
actual source of truth (`packages/domain-workflow/src/state-machine.ts`), not a
simplification:

| From | Can move to |
|---|---|
| DRAFT | VALIDATING |
| VALIDATING | PREFLIGHT_FAILED, READY |
| PREFLIGHT_FAILED | VALIDATING (fix and re-run pre-flight) |
| READY | PENDING_SIGNATURE |
| PENDING_SIGNATURE | PENDING_NOTARY |
| PENDING_NOTARY | READY_TO_SUBMIT |
| READY_TO_SUBMIT | SUBMITTING |
| SUBMITTING | SUBMITTED |
| SUBMITTED | COUNTY_PROCESSING, or straight to REJECTED |
| COUNTY_PROCESSING | REJECTED, RECORDED |
| REJECTED | RESUBMISSION_REQUIRED |
| RESUBMISSION_REQUIRED | VALIDATING (loops back to re-run pre-flight) |
| RECORDED | RECONCILING |
| RECONCILING | COMPLETE |

Plus three terminal dead-ends reachable from almost anywhere: **CANCELLED** (an operator can
cancel any non-finished package), **FAILED** (an unrecoverable system error during
submission/processing/reconciling), and **COMPLETE** (the happy ending).

In plain English: a package gets checked (VALIDATING → READY or bounced back), then it's
supposed to get a human signature and a notary stamp, then it's submitted to the county
electronically, tracked while the county processes it, and finally the fee gets settled.

**The gap you need to know about up front:** the "get a human signature, then a notary
stamp" middle section — `READY → PENDING_SIGNATURE → PENDING_NOTARY → READY_TO_SUBMIT` — was
never built. There is no button, no screen, and no API endpoint anywhere in this codebase
that performs those three transitions. Search the real application code
(`apps/api/src/routes`, `apps/worker/src/handlers`) for `PENDING_SIGNATURE` or
`PENDING_NOTARY` and you'll find zero references outside of test files. The only place this
gap is bridged is inside the automated test suite, which writes directly to the database to
skip past it — a comment in that test file says so explicitly:

> "Human-gated steps (signature capture, notary) have no real integration in this build yet
> — test setup advances status directly past them, matching what production code actually
> does today (nothing), rather than fabricating a fake capture flow."

**What this means for you:** if you run pre-flight successfully on a real package through the
UI or API, it will reach **READY** and then just sit there. Calling `/submit` on it will
always fail with a 409 error, because `/submit` requires the exact status
`READY_TO_SUBMIT`, and nothing in the running app can get a package there. This is not
something you need to file — it's tracked as a known gap (`docs/REQUIREMENTS_MATRIX.md`
items #28 and the signature/notary capture flow generally). Section 8 below explains how to
still exercise the rest of the lifecycle (submission through completion) for real.

## 5. Every screen in the web console — what's clickable, what's just a picture

This UI is deliberately minimal. Across the entire app there are exactly **three**
interactive things: the login form, two buttons on the Exceptions page, and the lookup form
on the Jurisdictions page. Everything else is read-only display. Knowing this up front will
save you time — don't go looking for a "submit" button on the package detail page; it
doesn't exist, because that action is API-only in this build (see section 8).

| Page | URL | What's there | Interactive? |
|---|---|---|---|
| Home | `/` | Landing page, nav links only. | No |
| Queue | `/queue` | Table of all packages: identifier, status, jurisdiction, deadline. Click a row to open its detail page. | Row links only — no filtering, sorting, or bulk actions yet. |
| Package detail | `/queue/<id>` | One package's full field set: status, document type, jurisdiction, county tracking number, recorded instrument number if recorded. | No — pure read-only. No document viewer, no action buttons, no event timeline (all three are tracked as not-yet-built, `docs/REQUIREMENTS_MATRIX.md` #28). |
| Exceptions | `/exceptions` | Two lists: packages needing operator attention (rejected / resubmission-required) and dead-lettered background jobs. | **Yes** — a "Resolve" button per package exception and a "Retry" button per dead-lettered job. These are the only real write actions anywhere in the web UI. |
| Jurisdictions | `/jurisdictions` | Look up any state's recording rules (document type, deadline, penalty, trustee/notary requirements). Shows a yellow "demo/seed data, not verified legal research" banner. | Yes — a lookup form (state code + optional county). Doesn't change data. |
| Integrations | `/integrations` | Health status of the 3 mock eRecording vendors plus LOS/storage stub connectors. | No — this is a stored value the worker last wrote, not a live health check ("This is a read model, not a live probe," per the code's own comment). |

Everything that actually moves a package forward — create, run pre-flight, submit, resubmit,
cancel — has no button anywhere in the web app. Those exist only as API calls. That's a real
gap in the UI (`docs/REQUIREMENTS_MATRIX.md` #25/#26 — no operations dashboard with those
actions has been built yet), not something hidden from you; you'll be using `curl` or
Postman for a meaningful chunk of real testing, per section 8.

## 6. Every API endpoint (this is where the real actions live)

Base URL: `http://localhost:4000/api/v1`. Every route needs `Authorization: Bearer
<accessToken>` from `/auth/login` except login itself. "Role" is what `requireRole` enforces
server-side — VIEWER can call none of the write endpoints, no matter what a UI might imply.

| Method & path | Role required | What it does |
|---|---|---|
| `POST /auth/login` | none | Email + password → access token (15 min) + refresh token (7 days) + user/role info. |
| `POST /auth/refresh` | none (valid refresh token) | Issues a fresh access+refresh token pair. Re-checks the user/role against the database each time, so a role change or deactivation takes effect immediately — not wired into the web app's UI, so you'd call this by hand if you want to test it. |
| `GET /releases` | any authenticated role | Paginated list of your org's packages (cursor-based). |
| `GET /releases/:id` | any authenticated role | One package's full record. |
| `POST /releases` | ORG_ADMIN, OPERATOR | Creates a new package. Requires an existing `loanId` and `propertyId` — **there is no endpoint to create a loan or property**, so you must reuse one of the 5 seeded ones (IDs in section 9) or ask engineering to insert one directly. Idempotent: retrying with the same `packageIdentifier` returns the existing row instead of erroring. |
| `POST /releases/:id/preflight` | ORG_ADMIN, OPERATOR | Runs the structural pre-flight checks (see section 7) and moves the package to READY or PREFLIGHT_FAILED. Only legal from DRAFT, PREFLIGHT_FAILED, or VALIDATING. |
| `POST /releases/:id/submit` | ORG_ADMIN, OPERATOR | Queues the real submission job. **Only works from READY_TO_SUBMIT** — which, per section 4, nothing in this build can currently produce through normal use. |
| `POST /releases/:id/resubmit` | ORG_ADMIN, OPERATOR | Only from RESUBMISSION_REQUIRED. Moves the package to VALIDATING and tells you to call `/preflight` next. |
| `POST /releases/:id/cancel` | ORG_ADMIN, OPERATOR | Cancels from almost any non-terminal state. |
| `GET /exceptions` | any authenticated role | The same two lists shown on the Exceptions page. |
| `POST /exceptions/:id/resolve` | ORG_ADMIN, OPERATOR | Same action as the Resolve/Retry buttons — works on either a package id or a dead-lettered job id. |
| `GET /jurisdictions` | any authenticated role | List of all seeded state rules. |
| `GET /jurisdictions/:stateCode?countyFips=...` | any authenticated role | One resolved jurisdiction rule (state + county merged). |
| `POST /fees/calculate` | any authenticated role | `{countyFips, pageCount}` → a recording fee breakdown, without needing a real package. |
| `GET /integrations` | any authenticated role | The same data shown on the Integrations page. |
| `GET /audit-events` | **ORG_ADMIN only** | Cursor-paginated audit log of every recorded action. Good endpoint to hit as Operator/Viewer to confirm the 403 role check. |
| `GET/POST /webhooks` | ORG_ADMIN, OPERATOR (for POST) | Registers/lists outbound webhook endpoints for this org. The signing secret is shown once, at creation, and never again. Note: the docs elsewhere mention a deliveries list / redelivery endpoint — those are **not actually implemented**; only registration exists today. |

## 7. The background worker — things that happen with nobody clicking anything

The worker polls a database-backed job queue on its own timer (default every 5 seconds) and
runs these jobs. None of these are triggered from a button; they only run once something
upstream (usually an API call) enqueues them, or on their own fixed schedule.

- **SUBMIT_PACKAGE** — enqueued by `POST /releases/:id/submit`. Renders the actual PDF
  document, builds the PRIA-format XML the county system expects, holds the estimated
  recording fee in escrow (auto-funding it from the loan's unpaid balance if needed — this
  build has no separate "payoff received" step), and calls the resolved mock vendor. On
  success it moves the package to SUBMITTED and schedules the next job below; on a vendor
  rejection at this stage it goes straight to REJECTED.
- **POLL_VENDOR_SUBMISSION** — checks the mock vendor's status every 30 seconds and
  re-enqueues itself until it hits a final answer (RECORDED or REJECTED). Updates the
  package status to match at each step (COUNTY_PROCESSING while pending, REJECTED or
  RECORDED at the end) and fires a webhook on every change. Reaching RECORDED also kicks off
  fee reconciliation.
- **RECONCILE_FEE** — compares the estimated fee held in escrow against what the vendor says
  the county actually charged. Outcomes: `BALANCED` (no action), `REFUND_QUEUED` (county
  charged less — money queued to go back), `DEFICIT_COVERED` (county charged more — the
  difference is covered from the account). Always integer-cents math, never floating point.
  Moves the package to COMPLETE at the end.
- **STATUTORY_DEADLINE_SCAN** — runs once an hour on its own, for every org, checking every
  in-flight package against that state's legal filing deadline. Fires a webhook only when a
  package's risk level actually escalates (e.g. from fine → approaching-deadline →
  past-deadline), not on every scan, so you won't see duplicate alerts for the same package
  sitting at the same risk level.
- **WEBHOOK_DELIVERY** — actually sends each outbound webhook (HMAC-signed). If the
  destination doesn't return a 2xx, the job queue's normal retry/backoff/dead-letter
  mechanism handles redelivery — there's no separate webhook-specific retry system.

**The mock vendor's behavior is deterministic and always eventually succeeds**, unless a
package's county uses the `MANUAL` network — see the gap below. By default: the 1st status
poll returns SUBMITTED, the 2nd returns ACCEPTED, the 3rd and onward return RECORDED. There's
no way to make the mock vendor reject a submission or throw errors through the running app —
those behaviors exist in the adapter's code but are only ever turned on inside automated
tests, not exposed to a real user.

## 8. The 4 roles, precisely

| Role | Read everything | Create/submit/resubmit/cancel packages | Resolve exceptions | View audit log |
|---|---|---|---|---|
| ORG_ADMIN | Yes | Yes | Yes | Yes |
| OPERATOR | Yes | Yes | Yes | No (403) |
| VIEWER | Yes | No (403) | No (403) | No (403) |
| API_CLIENT | Defined in the system, but has no seeded login and no working auth flow today — cannot actually be tested in this build. | | | |

Every one of these is enforced in the API itself (`requireRole` middleware on each route),
not just hidden in the UI — worth verifying directly via the network tab or `curl` rather
than trusting what buttons a role happens to see.

## 9. What's real, and what's a stand-in

| System | Status |
|---|---|
| Simplifile / CSC / ePN (the 3 eRecording vendors) | **Mock only.** No real vendor account or connection exists. |
| County e-Notary | **Mock only.** |
| LOS/TMS (loan origination system feed) | **Mock only** — an interface stub, not wired to anything real. |
| State statutory deadline/penalty rules | **Unverified demo data**, transcribed from a sample document, not checked against real law. Never present these numbers to anyone as legal fact. |
| County fee schedules | **Partial, demo-only** — only 5 counties have data at all (the ones behind the 5 seeded packages: LA County CA, Collin TX, Miami-Dade FL, Kings NY, Fulton GA). |
| PRIA XML schema compliance | **Unverified** — the XML is generated and structurally valid, but has not been checked against the official PRIA XSD. |
| Identity/login | Real, but local-only — no external identity provider. |
| Document/file storage | MinIO, a real local S3-compatible stand-in for AWS S3+KMS. |
| Bank/escrow ledger | **Mock/internal only** — no real wire transfers or bank connection; it's bookkeeping inside this system's own database. |

## 10. Other gaps worth knowing before you file a bug

These are real, verified-from-source behaviors of the current build — not the same as the
big signature/notary gap in section 4, but just as important to know up front:

- **Any package in a trustee-required state will always fail pre-flight, permanently.**
  About half the seeded states (including California, Arizona, Colorado, Nevada, and others
  — check the `trusteeRequired` column via `/jurisdictions`) require a named trustee on the
  document. There is currently no field anywhere — UI or API — to actually set a trustee
  name on a package, so pre-flight will always produce a `TRUSTEE_MISSING` blocking finding
  for those states, with no way to clear it. This is intentional, expected behavior for the
  current build (there's no trustee-capture feature yet), not a bug to report. For real
  happy-path testing, use a state that doesn't require one — Texas, Florida, New York, and
  Georgia (the states behind 4 of the 5 seeded packages) all work.
- **A package whose county routes to the `MANUAL` network gets permanently stuck.** One of
  the 5 seeded counties (Fulton County, GA) is configured with a `MANUAL` recording network,
  meaning "outside this system" — direct-to-county integrations were never built
  (`docs/REQUIREMENTS_MATRIX.md` #16). If you ever get a MANUAL-network package to
  `/submit` (it would first need to clear the signature/notary gap, so this is mostly a
  theoretical trap for whenever that's fixed), the submission job will throw immediately,
  retry a few times identically, and dead-letter — the package stays stuck in SUBMITTING
  forever. Retrying the dead-lettered job from the Exceptions page will fail the same way
  every time, since it's not a transient error.
- **You can't create a genuinely new loan or property through the app.** `POST /releases`
  requires an existing `loanId` and `propertyId`, and nothing in this build can create
  either one. To test package creation, reuse one of the 5 seeded loan/property pairs (IDs
  in section 11) or ask engineering to insert a new one directly in the database.
- **No automatic token refresh in the web app.** `/auth/refresh` exists and works, but
  nothing in the web UI calls it. A 15-minutes-idle session will start failing requests; the
  fix is logging out and back in, not a bug in whatever you were testing.
- **Witnesses are effectively never required in the seed data** — every seeded
  state/county's `witnessesRequired` is 0, even though the field and the corresponding
  `WITNESS_COUNT_INSUFFICIENT` pre-flight check both exist in the code. You won't see that
  check trigger against seed data; it's exercised only in the automated test suite with an
  artificial test jurisdiction.

## 11. How to actually see the full lifecycle behave, for real

Given the gap in section 4, here are the two ways to see real workflow behavior rather than
just static rows:

**Option A — ask engineering to run the automated scenario suite**
(`apps/worker/src/e2e-scenarios.test.ts`, scenarios A–J, driven against a real Postgres, the
real compiled API, and the real job-queue handlers — not a simplified stand-in). This is the
canonical reference for what *should* happen at every step, including the failure paths.
`docs/TEST_STRATEGY.md` lists what each lettered scenario covers.

**Option B — drive it yourself via the API**, working around the two gaps above:

1. Log in as operator, save the `accessToken`.
2. Create a new package reusing a seeded Texas loan/property (trustee not required, real
   CSC mock vendor) so it can actually reach submission:
   ```
   POST /api/v1/releases
   { "packageIdentifier": "QE-TEST-001",
     "loanId": "00000000-0000-0000-0000-200000000002",
     "propertyId": "00000000-0000-0000-0000-100000000002",
     "stateCode": "TX", "countyFips": "48085" }
   ```
3. `POST /releases/:id/preflight` — should return `passed: true` and move the package to
   READY (Texas doesn't require a trustee, so nothing blocks it).
4. This is where the gap bites: there's no real way to get from READY to READY_TO_SUBMIT.
   Ask engineering to advance the one test package's status directly in the database (the
   same thing the test suite's `advanceToReadyToSubmit()` helper does) if you need to see
   `/submit` onward behave for a package you created yourself.
5. Once at READY_TO_SUBMIT: `POST /releases/:id/submit` (202 response, queues a job), then
   watch the package on the Queue/detail page — status should move
   SUBMITTING → SUBMITTED → COUNTY_PROCESSING → RECORDED → RECONCILING → COMPLETE over
   roughly 30-90 seconds as the worker polls the mock vendor automatically.

## 12. The 5 seeded demo packages

| Identifier | State/County | Status | Loan ID | Property ID | What it shows |
|---|---|---|---|---|---|
| REL-2026-0001 | CA / Los Angeles | COMPLETE | `...200000000001` | `...100000000001` | Full happy path — submitted, recorded, fee charged. (California requires a trustee — this row is a static seed, never actually run through real pre-flight; don't expect a *new* CA package to behave the same way — see section 10.) |
| REL-2026-0002 | TX / Collin | COUNTY_PROCESSING | `...200000000002` | `...100000000002` | In flight, plus the one seeded dead-lettered job (Exceptions page). Trustee not required — safe for real happy-path testing. |
| REL-2026-0003 | FL / Miami-Dade | REJECTED | `...200000000003` | `...100000000003` | Has a rejection reason — shows in Exceptions. Trustee not required. |
| REL-2026-0004 | NY / Kings | RESUBMISSION_REQUIRED | `...200000000004` | `...100000000004` | One step further along than a fresh rejection — also in Exceptions. Trustee not required. |
| REL-2026-0005 | GA / Fulton | DRAFT | `...200000000005` | `...100000000005` | Not yet submitted. Uses the `MANUAL` network — see the permanently-stuck gap in section 10 before pushing this one through submission. |

Full IDs follow the pattern `00000000-0000-0000-0000-10000000000<n>` (property) and
`...20000000000<n>` (loan) for package `n` (1-5). These are static rows
(`packages/db/src/seed.ts`) meant for clicking through the UI's read screens — they were
never run through the real state machine, which is exactly why REL-2026-0001 can show
COMPLETE despite California's trustee requirement that would block a real submission today.

If your Queue/Exceptions look empty, someone hasn't run `pnpm --filter @project-lien/db
seed` yet against the database the app is pointed at — safe to re-run any time, it won't
duplicate data.

## 13. The canonical test scenarios (A–J)

`docs/TEST_STRATEGY.md` defines ten named end-to-end scenarios covering: the happy path,
pre-flight rejection (trustee missing), submission-time vendor rejection and resubmission,
duplicate-request idempotency, a mid-flight worker crash and recovery, fee
overage/underage reconciliation, and statutory deadline escalation. Scenario E (duplicate
*inbound* vendor webhook) is explicitly and honestly **not implemented** — this build only
has outbound webhooks, so there's no inbound receiver to test duplication against. Treat
this table as the reference for "what should happen," and the actual test file
(`apps/worker/src/e2e-scenarios.test.ts`) as the ground truth if the two ever disagree.

## 14. What to test

- **Login/session**: wrong password/email → clear error, no crash. Session persists on
  refresh. The nav bar shows your email + role once logged in, and Log out actually clears
  the session (confirm via a page refresh after logging out — you should be bounced to
  needing to log in again). Let a session sit idle past 15 minutes and confirm the failure
  mode is a clean error, not a crash.
- **Roles**: log in as Viewer and try any write action (create, submit, resubmit, cancel,
  resolve an exception) — every one should be rejected by the API (403), not just missing
  from the UI. Confirm via the browser's network tab, not just what buttons you see.
  Confirm Operator can do all of those but gets 403 on `/audit-events`.
- **Jurisdictions**: pick a few states with different rules (California's large daily
  penalty and trustee requirement; Missouri's unusually short 15-day deadline) and confirm
  the numbers match `packages/db/src/seed.ts`.
- **Queue / package detail / exceptions**: status colors match reality, deadlines compute
  correctly, a rejected package's reason shows on both the Exceptions list and its own
  detail page.
- **Integrations**: all 3 eRecording vendors should show "Healthy"; LOS/storage rows show
  "Unknown" (expected — interface stubs, not wired to anything real).
- **The real API actions** (section 6): since most of these have no UI button, exercise them
  directly — creation, pre-flight (including a trustee-required state to confirm it blocks
  correctly), resubmission, cancellation, and the exception-resolve/retry actions.
- **General**: browser back/forward, page refresh mid-session, window resizing — this UI
  hasn't had a dedicated accessibility/responsive pass, so rough edges here are useful
  findings, not something to assume is already covered.

## 15. If something looks wrong

Check `docs/REQUIREMENTS_MATRIX.md` first — it tracks what's actually implemented versus
still planned, so "this doesn't exist yet" may already be a known, tracked gap (this document
calls out the biggest ones in sections 4 and 10) rather than a new bug. Everything else is
fair game to report.
