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
