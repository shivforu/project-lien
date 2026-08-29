import { getDb } from "./client.js";

/**
 * Demo/dev seed data. Every jurisdiction row is inserted with status='UNVERIFIED' and
 * source='requirements_pdf_transcript' — see docs/DECISIONS.md D9 and
 * docs/EXTERNAL_DEPENDENCIES.md. These numbers come from an AI chat transcript's own
 * illustrative sample data, not from legal research, and must never be presented to a
 * user as authoritative law. A future phase may hand-verify a handful of states against
 * real citations (tracked as a TODO in docs/REQUIREMENTS_MATRIX.md item #39) — those
 * rows would flip to status='VERIFIED' with a real `source` citation and `verifiedBy`.
 *
 * The 50-state list itself (theory type, doc type, deadline, penalty, margins, notary
 * type) is carried over as *shape* from Requirements.pdf's final consolidated seed
 * (page 87-88 of the transcript) — reconciled to the canonical enum values in
 * docs/DECISIONS.md D10.
 */

type TheoryType = "LIEN_THEORY" | "TITLE_THEORY" | "INTERMEDIATE_THEORY";
type DocType =
  | "SATISFACTION_OF_MORTGAGE"
  | "DEED_OF_RECONVEYANCE"
  | "RELEASE_OF_LIEN"
  | "CANCELLATION_OF_SECURITY_DEED"
  | "SATISFACTION_OF_SECURITY_INSTRUMENT"
  | "CERTIFICATE_OF_SATISFACTION"
  | "RELEASE_OF_DEED_OF_TRUST";

interface StateSeedRow {
  code: string;
  name: string;
  theory: TheoryType;
  docType: DocType;
  deadlineDays: number;
  dailyPenaltyCents: number;
  trusteeRequired: boolean;
  topMarginInches: number;
}

const STATE_SEED: StateSeedRow[] = [
  { code: "AL", name: "Alabama", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "AK", name: "Alaska", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 2.0 },
  { code: "AZ", name: "Arizona", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 2.0 },
  { code: "AR", name: "Arkansas", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "CA", name: "California", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 30, dailyPenaltyCents: 50000, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "CO", name: "Colorado", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 90, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 1.0 },
  { code: "CT", name: "Connecticut", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "DE", name: "Delaware", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "FL", name: "Florida", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "GA", name: "Georgia", theory: "INTERMEDIATE_THEORY", docType: "CANCELLATION_OF_SECURITY_DEED", deadlineDays: 60, dailyPenaltyCents: 5000, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "HI", name: "Hawaii", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "ID", name: "Idaho", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "IL", name: "Illinois", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 20000, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "IN", name: "Indiana", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "IA", name: "Iowa", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "KS", name: "Kansas", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 60, dailyPenaltyCents: 50000, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "KY", name: "Kentucky", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "LA", name: "Louisiana", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "ME", name: "Maine", theory: "TITLE_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "MD", name: "Maryland", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "MA", name: "Massachusetts", theory: "TITLE_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 45, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "MI", name: "Michigan", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 75, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "MN", name: "Minnesota", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 60, dailyPenaltyCents: 50000, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "MS", name: "Mississippi", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "MO", name: "Missouri", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 15, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "MT", name: "Montana", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "NE", name: "Nebraska", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "NV", name: "Nevada", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 21, dailyPenaltyCents: 50000, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "NH", name: "New Hampshire", theory: "TITLE_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "NJ", name: "New Jersey", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "NM", name: "New Mexico", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 30, dailyPenaltyCents: 10000, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "NY", name: "New York", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 150000, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "NC", name: "North Carolina", theory: "TITLE_THEORY", docType: "SATISFACTION_OF_SECURITY_INSTRUMENT", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "ND", name: "North Dakota", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "OH", name: "Ohio", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 90, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "OK", name: "Oklahoma", theory: "LIEN_THEORY", docType: "RELEASE_OF_LIEN", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "OR", name: "Oregon", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 30, dailyPenaltyCents: 50000, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "PA", name: "Pennsylvania", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "RI", name: "Rhode Island", theory: "TITLE_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "SC", name: "South Carolina", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "SD", name: "South Dakota", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "TN", name: "Tennessee", theory: "TITLE_THEORY", docType: "RELEASE_OF_DEED_OF_TRUST", deadlineDays: 45, dailyPenaltyCents: 10000, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "TX", name: "Texas", theory: "LIEN_THEORY", docType: "RELEASE_OF_LIEN", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 2.0 },
  { code: "UT", name: "Utah", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "VT", name: "Vermont", theory: "TITLE_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "VA", name: "Virginia", theory: "TITLE_THEORY", docType: "CERTIFICATE_OF_SATISFACTION", deadlineDays: 90, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "WA", name: "Washington", theory: "TITLE_THEORY", docType: "DEED_OF_RECONVEYANCE", deadlineDays: 60, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "WV", name: "West Virginia", theory: "TITLE_THEORY", docType: "RELEASE_OF_DEED_OF_TRUST", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: true, topMarginInches: 3.0 },
  { code: "WI", name: "Wisconsin", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
  { code: "WY", name: "Wyoming", theory: "LIEN_THEORY", docType: "SATISFACTION_OF_MORTGAGE", deadlineDays: 30, dailyPenaltyCents: 0, trusteeRequired: false, topMarginInches: 3.0 },
];

// A handful of demo counties — real county names/FIPS codes for recognizability, but
// fee schedule numbers are still illustrative/UNVERIFIED demo values, not sourced from
// any county's actual published fee schedule.
const COUNTY_SEED = [
  { fips: "06037", state: "CA", name: "Los Angeles", baseFeeCents: 7500, perPageFeeCents: 300, network: "SIMPLIFILE" as const },
  { fips: "48085", state: "TX", name: "Collin", baseFeeCents: 2600, perPageFeeCents: 400, network: "CSC" as const },
  { fips: "12086", state: "FL", name: "Miami-Dade", baseFeeCents: 1000, perPageFeeCents: 850, network: "SIMPLIFILE" as const },
  { fips: "36047", state: "NY", name: "Kings", baseFeeCents: 6500, perPageFeeCents: 500, network: "EPN" as const },
  { fips: "13121", state: "GA", name: "Fulton", baseFeeCents: 2500, perPageFeeCents: 500, network: "MANUAL" as const },
];

export async function seed(): Promise<void> {
  const db = getDb();

  console.log(`[seed] Upserting ${STATE_SEED.length} state jurisdiction rules (UNVERIFIED demo data)...`);
  for (const s of STATE_SEED) {
    await db
      .insertInto("state_jurisdiction_rules")
      .values({
        state_code: s.code,
        state_name: s.name,
        theory_type: s.theory,
        default_doc_type: s.docType,
        statutory_deadline_days: s.deadlineDays,
        daily_penalty_cents: s.dailyPenaltyCents,
        trustee_required: s.trusteeRequired,
        top_margin_inches: s.topMarginInches.toFixed(2),
        source: "requirements_pdf_transcript",
        status: "UNVERIFIED",
      })
      .onConflict((oc) => oc.column("state_code").doUpdateSet((eb) => ({
        state_name: eb.ref("excluded.state_name"),
        theory_type: eb.ref("excluded.theory_type"),
        default_doc_type: eb.ref("excluded.default_doc_type"),
        statutory_deadline_days: eb.ref("excluded.statutory_deadline_days"),
        daily_penalty_cents: eb.ref("excluded.daily_penalty_cents"),
        trustee_required: eb.ref("excluded.trustee_required"),
        top_margin_inches: eb.ref("excluded.top_margin_inches"),
      })))
      .execute();
  }

  console.log(`[seed] Upserting ${COUNTY_SEED.length} demo county rules (UNVERIFIED)...`);
  for (const c of COUNTY_SEED) {
    await db
      .insertInto("county_jurisdiction_rules")
      .values({
        county_fips: c.fips,
        state_code: c.state,
        county_name: c.name,
        base_recording_fee_cents: c.baseFeeCents,
        per_page_fee_cents: c.perPageFeeCents,
        e_recording_network: c.network,
        source: "requirements_pdf_transcript",
        status: "UNVERIFIED",
      })
      .onConflict((oc) => oc.column("county_fips").doUpdateSet((eb) => ({
        county_name: eb.ref("excluded.county_name"),
        base_recording_fee_cents: eb.ref("excluded.base_recording_fee_cents"),
        per_page_fee_cents: eb.ref("excluded.per_page_fee_cents"),
        e_recording_network: eb.ref("excluded.e_recording_network"),
      })))
      .execute();
  }

  const orgId = "00000000-0000-0000-0000-000000000001";
  console.log("[seed] Upserting demo organization...");
  await db
    .insertInto("organizations")
    .values({ id: orgId, name: "Demo Title & Escrow Co.", slug: "demo-title-escrow" })
    .onConflict((oc) => oc.column("id").doUpdateSet((eb) => ({ name: eb.ref("excluded.name") })))
    .execute();

  // Demo login for local dev / manual UI verification (docs/LOCAL_DEVELOPMENT.md):
  // admin@demo-title-escrow.example / password123. Hash generated once with bcryptjs at
  // seed-authoring time — never regenerated at runtime, so this is a fixed, known
  // dev-only credential, not a randomly rotating one.
  console.log("[seed] Upserting demo admin user...");
  const demoUserId = "00000000-0000-0000-0000-0000000000f1";
  await db
    .insertInto("users")
    .values({
      id: demoUserId,
      email: "admin@demo-title-escrow.example",
      password_hash: "$2b$10$bxDvZTriIDad9qTrIV5t6.ppUth8B6bFGOI1xYU5Y1ftG0bD8xokS",
      full_name: "Demo Admin",
    })
    .onConflict((oc) => oc.column("id").doUpdateSet((eb) => ({ email: eb.ref("excluded.email") })))
    .execute();
  await db
    .insertInto("org_memberships")
    .values({ organization_id: orgId, user_id: demoUserId, role: "ORG_ADMIN" })
    .onConflict((oc) => oc.columns(["organization_id", "user_id"]).doNothing())
    .execute();

  // Demo integration connections (docs/REQUIREMENTS_MATRIX.md #30 — connector health UI).
  // These mirror the adapters this project actually has: the three mock eRecording
  // vendors from packages/adapters-erecording (Phase 5), plus the LOS/TMS and document
  // storage interface stubs (packages/adapters-los, packages/adapters-storage — both
  // still interface-only, hence health UNKNOWN). No unique constraint exists on
  // (organization_id, vendor), so this checks-then-inserts rather than upserting, to
  // keep reseeding idempotent without a schema change.
  console.log("[seed] Upserting demo integration connections...");
  const integrationSeed: Array<{ connectorType: string; vendor: string; config: Record<string, unknown>; health: string }> = [
    { connectorType: "ERECORDING", vendor: "SIMPLIFILE", config: { mode: "mock" }, health: "HEALTHY" },
    { connectorType: "ERECORDING", vendor: "CSC", config: { mode: "mock" }, health: "HEALTHY" },
    { connectorType: "ERECORDING", vendor: "EPN", config: { mode: "mock" }, health: "HEALTHY" },
    { connectorType: "LOS_TMS", vendor: "GENERIC_LOS", config: { mode: "interface_only" }, health: "UNKNOWN" },
    { connectorType: "STORAGE", vendor: "S3_COMPATIBLE", config: { mode: "interface_only" }, health: "UNKNOWN" },
  ];
  for (const conn of integrationSeed) {
    const existing = await db
      .selectFrom("integration_connections")
      .select("id")
      .where("organization_id", "=", orgId)
      .where("vendor", "=", conn.vendor)
      .executeTakeFirst();
    if (existing) continue;
    await db
      .insertInto("integration_connections")
      .values({
        organization_id: orgId,
        connector_type: conn.connectorType as never,
        vendor: conn.vendor,
        config: JSON.stringify(conn.config),
        health: conn.health as never,
        last_checked_at: new Date(),
      })
      .execute();
  }

  // Demo recording packages (docs/QE_QUICKSTART.md): without these, a fresh seed leaves
  // Queue and Exceptions genuinely empty — everything above only creates the org, the
  // login, jurisdiction rules, and integration connections, never a single package. That
  // was fine for automated tests (which build their own fixtures — apps/worker's
  // e2e-scenarios.test.ts is the actual end-to-end lifecycle reference) but left a real QE
  // with nothing to click through. These five are static, pre-set rows spanning the
  // statuses the UI actually branches on — they are NOT run through the real state
  // machine/vendor adapters (assertTransition, the job queue, etc. never touch them), so
  // don't treat them as a substitute for the e2e scenario suite when verifying workflow
  // *behavior* — only for exercising the UI's read screens against realistic-looking data.
  // One per already-seeded demo county so each also shows a different state's jurisdiction
  // rule (deadline days, doc type) actually reflected in its package.
  console.log("[seed] Upserting demo recording packages...");
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const addDays = (date: Date, n: number) => {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };

  interface DemoPackageSeed {
    n: number; // 1-5, drives every deterministic id/number below
    stateCode: string;
    countyFips: string;
    docType: DocType;
    deadlineDays: number;
    borrowerName: string;
    address: string;
    city: string;
    zip: string;
    unpaidPrincipalCents: number;
    status: string;
    settlementDaysAgo: number;
    submitted: boolean;
    recorded: boolean;
    rejectionReason: string | null;
    recordingFeeChargedCents: number | null;
  }

  const demoPackages: DemoPackageSeed[] = [
    {
      n: 1,
      stateCode: "CA",
      countyFips: "06037",
      docType: "DEED_OF_RECONVEYANCE",
      deadlineDays: 30,
      borrowerName: "Maria Gonzalez",
      address: "1420 Sunset Blvd",
      city: "Los Angeles",
      zip: "90026",
      unpaidPrincipalCents: 38500000,
      status: "COMPLETE",
      settlementDaysAgo: 45,
      submitted: true,
      recorded: true,
      rejectionReason: null,
      recordingFeeChargedCents: 8400, // 7500 base + 3 pages * 300
    },
    {
      n: 2,
      stateCode: "TX",
      countyFips: "48085",
      docType: "RELEASE_OF_LIEN",
      deadlineDays: 60,
      borrowerName: "James Whitfield",
      address: "912 Preston Rd",
      city: "Plano",
      zip: "75093",
      unpaidPrincipalCents: 27200000,
      status: "COUNTY_PROCESSING",
      settlementDaysAgo: 10,
      submitted: true,
      recorded: false,
      rejectionReason: null,
      recordingFeeChargedCents: null,
    },
    {
      n: 3,
      stateCode: "FL",
      countyFips: "12086",
      docType: "SATISFACTION_OF_MORTGAGE",
      deadlineDays: 60,
      borrowerName: "Aisha Thompson",
      address: "3301 NE 1st Ave",
      city: "Miami",
      zip: "33137",
      unpaidPrincipalCents: 41200000,
      status: "REJECTED",
      settlementDaysAgo: 20,
      submitted: true,
      recorded: false,
      rejectionReason: "County rejected: notary acknowledgment is missing the county of execution.",
      recordingFeeChargedCents: null,
    },
    {
      n: 4,
      stateCode: "NY",
      countyFips: "36047",
      docType: "SATISFACTION_OF_MORTGAGE",
      deadlineDays: 30,
      borrowerName: "David Chen",
      address: "88 Livingston St",
      city: "Brooklyn",
      zip: "11201",
      unpaidPrincipalCents: 61500000,
      status: "RESUBMISSION_REQUIRED",
      settlementDaysAgo: 18,
      submitted: true,
      recorded: false,
      rejectionReason: "Original submission rejected for an incorrect legal description; corrected copy prepared and ready to resubmit.",
      recordingFeeChargedCents: null,
    },
    {
      n: 5,
      stateCode: "GA",
      countyFips: "13121",
      docType: "CANCELLATION_OF_SECURITY_DEED",
      deadlineDays: 60,
      borrowerName: "Robert Jackson",
      address: "245 Peachtree Center Ave",
      city: "Atlanta",
      zip: "30303",
      unpaidPrincipalCents: 19800000,
      status: "DRAFT",
      settlementDaysAgo: 3,
      submitted: false,
      recorded: false,
      rejectionReason: null,
      recordingFeeChargedCents: null,
    },
  ];

  for (const p of demoPackages) {
    const propertyId = `00000000-0000-0000-0000-10000000000${p.n}`;
    const loanId = `00000000-0000-0000-0000-20000000000${p.n}`;
    const packageId = `00000000-0000-0000-0000-30000000000${p.n}`;
    const settlementDate = daysAgo(p.settlementDaysAgo);
    const statutoryDeadline = addDays(settlementDate, p.deadlineDays);

    await db
      .insertInto("properties")
      .values({
        id: propertyId,
        organization_id: orgId,
        parcel_number: `PARCEL-${p.n.toString().padStart(4, "0")}`,
        address_line1: p.address,
        city: p.city,
        state_code: p.stateCode,
        zip_code: p.zip,
        county_fips: p.countyFips,
        county_name: p.city,
      })
      .onConflict((oc) => oc.column("id").doUpdateSet((eb) => ({ address_line1: eb.ref("excluded.address_line1") })))
      .execute();

    await db
      .insertInto("loans")
      .values({
        id: loanId,
        organization_id: orgId,
        loan_number: `LN-2026-${p.n.toString().padStart(4, "0")}`,
        property_id: propertyId,
        unpaid_principal_cents: p.unpaidPrincipalCents,
        interest_rate_bps: 650,
        borrower_name: p.borrowerName,
        status: p.recorded ? "RELEASED" : "PAYOFF_REQUESTED",
      })
      .onConflict((oc) => oc.column("id").doUpdateSet((eb) => ({ status: eb.ref("excluded.status") })))
      .execute();

    await db
      .insertInto("recording_packages")
      .values({
        id: packageId,
        organization_id: orgId,
        package_identifier: `REL-2026-${p.n.toString().padStart(4, "0")}`,
        loan_id: loanId,
        property_id: propertyId,
        state_code: p.stateCode,
        county_fips: p.countyFips,
        status: p.status as never,
        document_type: p.docType,
        statutory_deadline: statutoryDeadline,
        rejection_reason: p.rejectionReason,
        county_tracking_number: p.submitted ? `CTN-${p.stateCode}-${p.n}` : null,
        recorded_book: p.recorded ? "4021" : null,
        recorded_page: p.recorded ? "0187" : null,
        recorded_instrument_number: p.recorded ? `2026-${p.n}00456` : null,
        recording_fee_charged_cents: p.recordingFeeChargedCents,
        submitted_at: p.submitted ? addDays(settlementDate, 2) : null,
        recorded_at: p.recorded ? addDays(settlementDate, 10) : null,
        completed_at: p.recorded ? addDays(settlementDate, 11) : null,
      })
      .onConflict((oc) => oc.column("id").doUpdateSet((eb) => ({
        status: eb.ref("excluded.status"),
        rejection_reason: eb.ref("excluded.rejection_reason"),
      })))
      .execute();
  }

  // One dead-lettered job on the still-in-flight Texas package (#2) — the second half of
  // the Exceptions page (GET /api/v1/exceptions's jobExceptions), which packageExceptions
  // above (REJECTED/RESUBMISSION_REQUIRED packages #3/#4) don't cover. Models a poll job
  // that exhausted its retries against the mock vendor, leaving an otherwise-fine-looking
  // COUNTY_PROCESSING package silently stuck until an operator intervenes.
  const existingDeadLetterJob = await db
    .selectFrom("workflow_jobs")
    .select("id")
    .where("package_id", "=", "00000000-0000-0000-0000-300000000002")
    .where("job_type", "=", "POLL_VENDOR_SUBMISSION")
    .executeTakeFirst();
  if (!existingDeadLetterJob) {
    await db
      .insertInto("workflow_jobs")
      .values({
        package_id: "00000000-0000-0000-0000-300000000002",
        job_type: "POLL_VENDOR_SUBMISSION",
        status: "DEAD_LETTER",
        payload: JSON.stringify({ packageId: "00000000-0000-0000-0000-300000000002" }),
        attempts: 5,
        max_attempts: 5,
        last_error: "Vendor polling failed: CSC status API timed out after 5 attempts.",
      })
      .execute();
  }

  console.log("[seed] Done.");
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed] Failed:", err);
      process.exit(1);
    });
}
