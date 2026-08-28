# Architecture Decision Record

Each decision below resolves a place where Requirements.pdf either contradicted itself,
described something never actually implemented, or left an open architectural choice.
"Requirements.pdf" is a 123-page transcript of an evolving chat with an AI (Gemini) about
this product, not a specification — later corrections in that transcript are treated as
superseding earlier ones, per the project's source-of-truth rule.

## D1: Language & runtime
**Decision:** TypeScript on Node.js 20 LTS for all backend/worker/adapter code. React 18 +
Next.js 14 (App Router) + Tailwind CSS for the frontend.
**Why:** Matches the large majority of code samples in Requirements.pdf (Modules 1–6,
the dashboard component). Keeps one language across the stack, which matters for a
solo/small-team build.

## D2: Database & schema management
**Decision:** PostgreSQL 16. Hand-authored, numbered raw-SQL migrations (run by a small
custom runner) plus **Kysely** for typed query building at runtime.
**Why (original plan, then revised):** Requirements.pdf contains at least three drifting
versions of the SQL schema (page 10 initial, page 37 Module-1 version, page 85
consolidated `000_init_all.sql`). We derived one coherent schema from the *union* of
entities across the whole document (see docs/REQUIREMENTS_MATRIX.md); that part of the
plan didn't change. What changed is the tool: Prisma was the first choice, but Prisma's
CLI (`generate`, `migrate dev/deploy`) fetches a native "query engine"/"schema engine"
binary from `binaries.prisma.sh` on every fresh install, and that host returned `403` in
this build environment (confirmed directly with `curl`, not just via the CLI). Rather
than build the platform's core data layer on a tool that silently can't apply its own
migrations the moment a network policy (a corporate proxy, an offline CI runner, this
sandbox) doesn't allow that one CDN, we moved to a dependency chain that only touches the
ordinary npm registry: `pg` for the driver, hand-written `.sql` files under
`packages/db/migrations/` as the single source of truth for the schema, a ~40-line
runner (`packages/db/src/migrate.ts`) that tracks applied migrations in a
`_migrations` table and runs each new file inside a transaction, and Kysely for
compile-time-checked queries against a hand-maintained `Database` type
(`packages/db/src/schema.ts`) mirroring the SQL 1:1. This was verified end-to-end in
this environment: migration applies from empty against a real local Postgres 16
instance. If a future environment has unrestricted network access, Prisma remains a fine
choice and could be reintroduced — this decision is about not taking on that fragility by
default for something as central as schema migrations.

## D3: Workflow orchestration — Temporal vs. DB-backed state machine
**Decision:** Database-backed workflow engine: a `workflow_events` / `jobs` table in
Postgres, a worker process that claims jobs with `FOR UPDATE SKIP LOCKED`, explicit
retry counters with exponential backoff, and a dead-letter state after N failures.
**Why:** Requirements.pdf *describes* Temporal.io/Kafka in its aspirational architecture
diagrams (pages 29, 31) but the code it actually built (Module 6) never used them — it
used a bare `setInterval` polling loop with no persistence of retry state, no backoff, no
idempotency guard, and no recovery story after a process restart. That is a real gap
against this project's explicit requirement for retries/backoff/dead-letter/idempotency/
restart-recovery. Temporal would satisfy that requirement well, but it also requires a
separate server, its own persistence store, and an SDK the developer has to learn — which
conflicts with "must remain runnable locally with straightforward commands" and "a
developer should be able to clone the repo and get a useful environment running." A
Postgres-backed queue keeps the whole system observable with plain SQL and is sufficient
for this domain's throughput (packages per day, not per second). This is documented as
revisitable: if volume ever demands true durable workflow histories with complex human-
in-the-loop signals, Temporal is the natural upgrade path, and the orchestrator is built
behind an interface so that swap doesn't ripple through the domain code.

## D4: Document generation — Puppeteer/HTML vs. pdf-lib drawText
**Decision:** Canonical document generation uses Handlebars HTML templates rendered to
PDF via headless Chromium (Puppeteer). `pdf-lib` is used downstream for PDF *inspection*
and *margin/stamp-zone normalization* only (measuring pages, shifting/padding content,
never regenerating body text).
**Why:** Requirements.pdf shows two competing approaches: an HTML/Puppeteer pipeline
(pages 5–6, 14–15) and a programmatic `pdf-lib` `drawText` generator (Module 2, pages
47–48, `StatutoryDocGenerator.ts`). The latter hardcodes legal boilerplate as string
literals with manual x/y coordinates, which is unmaintainable and risky for text a
non-engineer will need to review and correct per state. Templates are reviewable by a
non-engineer, diffable, and match the "master template with conditional injectors" idea
Requirements.pdf itself proposes (page 27) as the realistic path to covering 50 states.
**Decision (revised, Phase 3):** headless-Chromium driver is **Playwright**, not
Puppeteer. Both wrap the same Chrome DevTools Protocol and the swap is a one-file change
(`packages/domain-documents/src/pdf/renderer.ts`); the reason is entirely environmental,
the same class of issue as D2's Prisma pivot: this build sandbox comes with Playwright's
Chromium already installed at a fixed path (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`,
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`), so `npx playwright install` is never invoked and
there is no at-install-time CDN fetch to fail. Puppeteer's install step downloads its own
Chromium build from `storage.googleapis.com` on every fresh `pnpm install`, which is
exactly the kind of external-CDN dependency that broke Prisma in this same sandbox — using
Puppeteer would have been an unverified bet that a *different* CDN happens to be reachable.
Playwright's `chromium.launch()` (resolved via its own installed-browser registry, or an
explicit `executablePath` override) was verified working end-to-end in this build (see
PROGRESS.md Phase 3). On a machine without a pre-installed browser, `playwright install
chromium` is the equivalent one-time setup step (documented in docs/LOCAL_DEVELOPMENT.md);
the rendering code itself does not care which tool fetched the browser.

## D5: Computer-vision / notary-seal validation
**Decision:** Define `ISignatureVisionProvider` (checks: signature present, notary seal
present, scan resolution, clipping) with a deterministic mock/rule-based implementation
for local dev and tests. No real computer-vision model is integrated.
**Why:** Requirements.pdf's `VisionValidator.ts` (Module 2, pages 44–46) is not real
computer vision — it counts dark pixels in the lower third of the page and edge-transition
density as a signature/seal proxy. Presenting that as production CV would violate this
project's explicit instruction not to claim something works before it's verified. The
interface boundary lets a real document-AI vendor (Textract, Google Document AI, a
notary-specific vendor) be swapped in later without touching the pre-flight pipeline.

## D6: eRecording vendor adapters
**Decision:** `IErecordingProvider` interface (`submit`, `getStatus`, `cancel`,
`getReceipt`, `getRecordedDocument`, `getFees`, `healthCheck`) with Simplifile, CSC, and
ePN implemented as **sandbox/mock adapters only**, plus contract tests that any future
real adapter must pass.
**Why:** Requirements.pdf's adapters (Module 4) use invented endpoint paths
(`/v2/packages/submit`), invented SOAP actions, and invented response shapes — the
document itself never claims these came from real vendor documentation. Per this
project's explicit rule against fabricating vendor APIs, none of those exact shapes are
treated as real; they're kept as *design input* for what a REST vs. SOAP vs. JSON adapter
shape looks like, reimplemented as clearly-labeled mocks. Real Simplifile/CSC/ePN
integration requires vendor sandbox credentials and specs (tracked in
EXTERNAL_DEPENDENCIES.md).

## D7: PRIA packaging
**Decision:** A canonical, vendor-neutral internal package model; a PRIA-shaped XML
serializer for the mock pipeline; schema validation checks our own internal contract
(structural completeness), not the real PRIA XSD.
**Why:** Requirements.pdf changed the PRIA XML namespace mid-document
(`.../standards/3.0.0` → `.../standards/3/0/0`, page 60) while admitting neither was
checked against a real spec. The real PRIA XSD is licensed/member-gated — we don't have
it — so validating against it would be fabricating conformance. We validate structure
(required nodes present, embedded file non-empty, county FIPS present) and label PRIA
XSD conformance as an explicit external dependency.

## D8: PRIA package level
**Decision:** Implement PRIA "Level 2" (rendered PDF + XML metadata wrapper) only for v1.
Level 3 (SMART doc, X.509-signed XML/canvas binding) is modeled as a future adapter
capability flag, not implemented.
**Why:** Requirements.pdf names both levels (page 50) but never implements Level 3, and
Level 3 requires a PKI/signing vendor we don't have. Building it now would be exactly the
kind of unverified "production-ready" claim this project forbids.

## D9: Compliance rule data (50-state matrix)
**Decision:** All state/county rule rows are seeded with `status = UNVERIFIED`,
`source = 'requirements_pdf_transcript'`. None are marked `VERIFIED` unless independently
re-derived from a citable primary source during Phase 2, in which case the citation is
recorded in the rule's `source` field. No county-level FIPS fee data is fabricated beyond
a small hand-picked demo set.
**Why:** The 50-state numbers in Requirements.pdf (statutory deadline days, daily
penalties, margins, trustee/witness flags) are the AI chat's own invented sample data —
the document says as much on page 25 ("we have not yet included all state-specific rules,
laws"). Treating them as law would violate this project's explicit rule 7. They are useful
*shape* (which states are lien-theory vs. title-theory, what fields a rule needs) but not
truth.

## D10: Naming reconciliation
**Decision:** Canonical names, superseding earlier transcript versions:
- Table `state_jurisdiction_rules` (not the earlier `state_compliance_rules`).
- Type `CountyJurisdictionRule` (not the earlier `CountyRule`), matching the later
  "Fix 3" correction in the transcript (page 99–100).
- `doc_type` enum is the **union** of every instrument type used across the final 50-state
  seed: `SATISFACTION_OF_MORTGAGE`, `DEED_OF_RECONVEYANCE`, `RELEASE_OF_LIEN`,
  `CANCELLATION_OF_SECURITY_DEED`, `SATISFACTION_OF_SECURITY_INSTRUMENT`,
  `CERTIFICATE_OF_SATISFACTION`, `RELEASE_OF_DEED_OF_TRUST`.
- ePN always has its own adapter; it is never silently aliased to Simplifile (the
  transcript's first draft did this, then explicitly corrected it on page 69).
- PDF margin math always clamps `yOffset` to `>= requiredBottomPoints` (the transcript's
  page 60–61 correction), and vendor XML payloads are sent as raw UTF-8, never
  double-base64-encoded (page 68–69 correction).

## D11: Auth & tenancy
**Decision:** Local email/password + JWT (access + refresh) auth with an
organization-scoped RBAC model, built behind an interface so Auth0/Okta/SAML SSO can be
substituted later without changing authorization logic.
**Why:** Requirements.pdf names Auth0/Okta (page 8) but never supplies credentials or
tenant config, and this project must run without vendor credentials.

## D12: Document storage
**Decision:** MinIO (S3-compatible) in docker-compose for local/dev; storage access goes
through an `IDocumentStorage` interface so AWS S3 + KMS can be dropped in for production
with only a config/adapter change.

## D13: Monorepo tooling
**Decision:** pnpm workspaces + Turborepo. Apps: `api`, `worker`, `web`. Shared packages
for the jurisdiction engine, fee engine, document/pre-flight engine, PRIA engine,
workflow engine, escrow ledger, vendor adapters, storage adapter, LOS/TMS adapter,
shared types, and shared config/logging.
**Why:** The domains above are independently testable and reused between the API and the
worker process; a monorepo with shared packages avoids duplicating domain logic between
those two runtimes while keeping one `pnpm install` / one CI pipeline.

## D14: Module output is CommonJS, despite ESM-style source
**Decision:** No `package.json` in this repo sets `"type": "module"`. Combined with
`tsconfig.base.json`'s `module`/`moduleResolution: NodeNext`, this means every package's
source is *authored* in ESM syntax (`import`/`export`, `.js`-suffixed relative imports)
but *compiles* to CommonJS `require()` output — TypeScript's NodeNext mode picks the
output format per package based on its `package.json` `type` field, and the absence of
that field defaults to CommonJS.
**Why:** This was never a deliberate choice — it surfaced in Phase 8 when
`apps/api/src/app.ts` tried to use `import.meta.url` (to resolve `openapi.json`'s path
relative to the compiled file) and `tsc` rejected it with "the 'import.meta' meta-property
is not allowed in files which will build into CommonJS output." The fix used there is the
ambient CommonJS `__dirname` instead. Left as CommonJS output rather than adding
`"type": "module"` everywhere, because switching now would need re-verifying every
package's build/test/runtime behavior (Jest/vitest-style test runners and some npm
packages still assume CJS by default) for no functional benefit at this project's current
stage — worth revisiting deliberately in a later phase if there's a concrete reason to
want native ESM output (e.g. top-level await, or a dependency that is ESM-only).
