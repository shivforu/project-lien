# Project Lien — QE Quickstart

## What this is
Project Lien is a mortgage lien-release / eRecording platform — think of it as a modern
alternative to Simplifile. It covers the workflow a title/escrow company runs after a loan
payoff: preparing the release document, checking it against state/county recording rules,
submitting it electronically to a county recorder, tracking it until recorded, and
reconciling the recording fee. It's a demo build using mock vendors (no real county/eRecording
connections) and unverified seed data for legal rules — nothing here is production data.

The system has three moving parts: a REST **API**, a background **worker** that drives
packages through their lifecycle (submit → county processing → recorded/rejected → fee
reconciled), and a web **operations console** you'll use for testing.

## How to get in
1. Ask engineering to start the app locally (`pnpm dev`) — it runs at:
   - Web console: **http://localhost:3000**
   - API (used by the console, not something you need to call directly): http://localhost:4000
2. Log in at http://localhost:3000/login. Three seeded logins exist, all with password
   **`password123`**, one per role:

   | Email | Role | Can do |
   |---|---|---|
   | `admin@demo-title-escrow.example` | ORG_ADMIN | Everything, including the audit log. |
   | `operator@demo-title-escrow.example` | OPERATOR | The day-to-day work — create/submit/resubmit/cancel packages, resolve exceptions — but can't view the audit log. |
   | `viewer@demo-title-escrow.example` | VIEWER | Read-only. Every write action is rejected by the API even if a button doesn't visibly disable itself. |

All three belong to the same seeded demo organization ("Demo Title & Escrow Co.") and see
the same data — only what they're allowed to *do* differs. Useful for confirming role
enforcement actually works server-side, not just that the UI happens to hide a button.

## Where to look

| Page | URL | What you'll find |
|---|---|---|
| Home | `/` | Landing page with nav links. |
| Queue | `/queue` | 5 seeded demo packages across different statuses (draft, in-flight, recorded/complete, rejected, needs resubmission). Click a row for package detail. |
| Package detail | `/queue/<id>` | One package's status, document type, jurisdiction, county tracking number, recorded instrument number if recorded. |
| Exceptions | `/exceptions` | 2 seeded packages needing operator attention (rejected / resubmission-required) plus 1 seeded dead-lettered background job. |
| Jurisdictions | `/jurisdictions` | Look up any US state's recording rules — document type required, statutory deadline, penalty for late release, notary requirements, etc. Fully populated for all 50 states. |
| Integrations | `/integrations` | Health status of the 3 mock eRecording vendor connections (Simplifile, CSC, ePN) plus the LOS and storage adapter stubs. |

## The 5 seeded demo packages
| Identifier | State/County | Status | What it shows |
|---|---|---|---|
| REL-2026-0001 | CA / Los Angeles | COMPLETE | Full happy path — submitted, recorded, fee charged. |
| REL-2026-0002 | TX / Collin | COUNTY_PROCESSING | In flight, plus the one seeded dead-lettered job (Exceptions page). |
| REL-2026-0003 | FL / Miami-Dade | REJECTED | Has a rejection reason — shows in Exceptions. |
| REL-2026-0004 | NY / Kings | RESUBMISSION_REQUIRED | Also shows in Exceptions, one step further along than a fresh rejection. |
| REL-2026-0005 | GA / Fulton | DRAFT | Not yet submitted. |

These are static rows (`packages/db/src/seed.ts`) meant for clicking through the UI's read
screens, not a live simulation — they were never run through the real state machine or
vendor adapters. If you need to see the actual workflow *behave* (a package really moving
through submit → poll → reject → resubmit → record → reconcile), the automated scenario
suite (`apps/worker/src/e2e-scenarios.test.ts`, scenarios A–J) is the real reference; ask
engineering to walk you through it or its output.

If your Queue/Exceptions still look empty, someone hasn't run `pnpm --filter
@project-lien/db seed` yet against the database the app is currently pointed at (or ran it
against a different one) — that command is safe to re-run any time and won't duplicate data.

## What to test
- **Login**: wrong password/email → clear error, no crash. Session persists on refresh;
  logging out (if a logout control exists) clears it.
- **Roles**: log in as Viewer and try any action (submit, resubmit, cancel, resolve an
  exception) — it should be rejected, not just hidden. Log in as Operator and confirm those
  same actions work but the audit log doesn't. This is enforced by the API itself, so it's
  worth checking directly (e.g. via the browser's network tab) rather than only by what
  buttons the UI happens to show for each role.
- **Jurisdictions**: pick a handful of states with different rules (e.g. California has a
  large daily late penalty and requires a trustee; Missouri has an unusually short 15-day
  deadline) and confirm the numbers shown match `packages/db/src/seed.ts`.
- **Queue / package detail / exceptions**: check status colors match reality, deadlines are
  computed correctly, and a rejected package's reason is visible on both the Exceptions
  list and its own package detail page.
- **Integrations**: all 3 eRecording vendors should show "Healthy"; the LOS/storage rows
  show "Unknown" (they're interface stubs, not wired to anything real yet — that's expected).
- **General**: browser back/forward, page refresh mid-session, and resizing — this UI hasn't
  had a dedicated accessibility/responsive pass yet, so rough edges there are useful findings,
  not something to assume is already covered.

## If something looks wrong
Check `docs/REQUIREMENTS_MATRIX.md` first — it tracks what's actually implemented vs. still
planned, so "this feature doesn't exist yet" may already be a known, tracked gap rather than
a bug. Everything else is fair game to report.
