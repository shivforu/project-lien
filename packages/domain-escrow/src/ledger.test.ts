import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "@project-lien/db";
import { runMigrations } from "@project-lien/db";
import { depositPayoff, getOrCreateEscrowAccount, holdRecordingFee, InsufficientFundsError, remitRecordingFee } from "./ledger.js";

// Integration test against a real Postgres — proves the FOR UPDATE-locked balance
// mutations and the immutable ledger_transactions trail actually work together
// (docs/TEST_STRATEGY.md; this is the domain-escrow analog of domain-workflow's job-queue
// concurrency test).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/project_lien_test";

let db: Kysely<Database>;
let orgId: string;
let loanId: string;
let propertyId: string;

async function createPackage(identifier: string): Promise<string> {
  const pkg = await db
    .insertInto("recording_packages")
    .values({
      organization_id: orgId,
      package_identifier: identifier,
      loan_id: loanId,
      property_id: propertyId,
      state_code: "CA",
      county_fips: "06037",
      document_type: "DEED_OF_RECONVEYANCE",
      statutory_deadline: new Date("2026-12-31"),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return pkg.id;
}

beforeAll(async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(TEST_DATABASE_URL);
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_DATABASE_URL }) }) });

  const org = await db.insertInto("organizations").values({ name: "Test Org", slug: "test-org" }).returning("id").executeTakeFirstOrThrow();
  orgId = org.id;
  await db.insertInto("state_jurisdiction_rules").values({
    state_code: "CA", state_name: "California", theory_type: "TITLE_THEORY", default_doc_type: "DEED_OF_RECONVEYANCE", statutory_deadline_days: 30,
  }).execute();
  await db.insertInto("county_jurisdiction_rules").values({ county_fips: "06037", state_code: "CA", county_name: "Los Angeles" }).execute();
  const property = await db
    .insertInto("properties")
    .values({ organization_id: orgId, parcel_number: "1", address_line1: "1 Main St", city: "LA", state_code: "CA", zip_code: "90001", county_fips: "06037", county_name: "Los Angeles" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const loan = await db
    .insertInto("loans")
    .values({ organization_id: orgId, loan_number: "LN-1", property_id: property.id, unpaid_principal_cents: 0, interest_rate_bps: 0, borrower_name: "Jane Borrower" })
    .returning("id")
    .executeTakeFirstOrThrow();
  loanId = loan.id;
  propertyId = property.id;
});

afterAll(async () => {
  await db.destroy();
});

describe("escrow ledger", () => {
  it("deposits, holds, and remits with an overage refund", async () => {
    const account = await getOrCreateEscrowAccount(db, orgId, loanId);
    const packageId = await createPackage("PKG-ESCROW-1");
    await depositPayoff(db, account.id, 100000, "Initial payoff deposit");

    let row = await db.selectFrom("escrow_accounts").selectAll().where("id", "=", account.id).executeTakeFirstOrThrow();
    expect(row.balance_cents).toBe(100000);

    await holdRecordingFee(db, account.id, packageId, 8800);
    row = await db.selectFrom("escrow_accounts").selectAll().where("id", "=", account.id).executeTakeFirstOrThrow();
    expect(row.balance_cents).toBe(91200);
    expect(row.held_recording_fee_cents).toBe(8800);

    // County actually charged less than estimated -> refund back into balance.
    const outcome = await remitRecordingFee(db, account.id, packageId, 8800, 8000);
    expect(outcome.outcome).toBe("REFUND_QUEUED");

    row = await db.selectFrom("escrow_accounts").selectAll().where("id", "=", account.id).executeTakeFirstOrThrow();
    expect(row.held_recording_fee_cents).toBe(0);
    expect(row.balance_cents).toBe(91200 + 800); // refund of the 800-cent overage

    const transactions = await db.selectFrom("ledger_transactions").selectAll().where("escrow_account_id", "=", account.id).execute();
    expect(transactions.map((t) => t.type)).toEqual(["PAYOFF_DEPOSIT", "RECORDING_FEE_HELD", "RECORDING_FEE_REMITTED", "ESCROW_REFUND_ISSUED"]);

    const reconciliation = await db.selectFrom("fee_reconciliations").selectAll().where("package_id", "=", packageId).executeTakeFirstOrThrow();
    expect(reconciliation.status).toBe("REFUND_QUEUED");
  });

  it("covers a fee shortage (deficit) from balance", async () => {
    const account = await getOrCreateEscrowAccount(db, orgId, loanId);
    const packageId = await createPackage("PKG-ESCROW-2");
    await depositPayoff(db, account.id, 10000, "Top-up before shortage test");
    await holdRecordingFee(db, account.id, packageId, 5000);
    const outcome = await remitRecordingFee(db, account.id, packageId, 5000, 5500);
    expect(outcome.outcome).toBe("DEFICIT_COVERED");
    expect(outcome.varianceCents).toBe(500);
  });

  it("refuses to hold more than the available balance", async () => {
    const account = await getOrCreateEscrowAccount(db, orgId, loanId);
    const packageId = await createPackage("PKG-ESCROW-3");
    await expect(holdRecordingFee(db, account.id, packageId, 100_000_000)).rejects.toThrow(InsufficientFundsError);
  });

  it("rejects non-integer or non-positive amounts (guards against float cents)", async () => {
    const account = await getOrCreateEscrowAccount(db, orgId, loanId);
    await expect(depositPayoff(db, account.id, 10.5, "bad")).rejects.toThrow(RangeError);
    await expect(depositPayoff(db, account.id, -5, "bad")).rejects.toThrow(RangeError);
  });
});
