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
2. Log in at http://localhost:3000/login with:
   - **Email:** `admin@demo-title-escrow.example`
   - **Password:** `password123`

This account is an Org Admin for the seeded demo organization ("Demo Title & Escrow Co."),
so it can see and act on everything.

## Where to look

| Page | URL | What you'll find |
|---|---|---|
| Home | `/` | Landing page with nav links. |
| Queue | `/queue` | List of recording packages (releases) for the org, with status/deadline. Click a row for package detail. **Starts empty** — see note below. |
| Package detail | `/queue/<id>` | One package's status, document type, jurisdiction, county tracking number, recorded instrument number if recorded. |
| Exceptions | `/exceptions` | Packages that failed pre-flight/rejected by the county, and background jobs that failed after retrying. **Starts empty on fresh data.** |
| Jurisdictions | `/jurisdictions` | Look up any US state's recording rules — document type required, statutory deadline, penalty for late release, notary requirements, etc. Fully populated for all 50 states — this is the best page to explore first. |
| Integrations | `/integrations` | Health status of the 3 mock eRecording vendor connections (Simplifile, CSC, ePN) plus the LOS and storage adapter stubs. |

## Important: the queue starts empty
The seed data creates the demo org, your login, all 50 states' jurisdiction rules, and the
3 mock vendor connections — but **no sample recording packages**. So Queue and Exceptions
will look empty right after setup; that's expected, not a bug. To see packages moving
through the real lifecycle (submitted → county processing → recorded, rejections,
resubmission, fee reconciliation with over/short payment), ask engineering to either:
- point you at the automated scenario suite (`apps/worker/src/e2e-scenarios.test.ts`,
  scenarios A–J), which exercises every one of these paths end to end and is the most
  complete reference for "what should happen," or
- seed a few demo packages into your local database for you to click through live.

## What to test
- **Login**: wrong password/email → clear error, no crash. Session persists on refresh;
  logging out (if a logout control exists) clears it.
- **Jurisdictions**: pick a handful of states with different rules (e.g. California has a
  large daily late penalty and requires a trustee; Missouri has an unusually short 15-day
  deadline) and confirm the numbers shown match `packages/db/src/seed.ts`.
- **Queue / package detail / exceptions**: once packages exist, check status colors match
  reality, deadlines are computed correctly, and a rejected package's reason is visible.
- **Integrations**: all 3 eRecording vendors should show "Healthy"; the LOS/storage rows
  show "Unknown" (they're interface stubs, not wired to anything real yet — that's expected).
- **General**: browser back/forward, page refresh mid-session, and resizing — this UI hasn't
  had a dedicated accessibility/responsive pass yet, so rough edges there are useful findings,
  not something to assume is already covered.

## If something looks wrong
Check `docs/REQUIREMENTS_MATRIX.md` first — it tracks what's actually implemented vs. still
planned, so "this feature doesn't exist yet" may already be a known, tracked gap rather than
a bug. Everything else is fair game to report.
