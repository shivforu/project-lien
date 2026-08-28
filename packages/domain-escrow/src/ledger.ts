import type { Kysely, Transaction } from "kysely";
import type { Database } from "@project-lien/db";
import { compareFeeToActual } from "@project-lien/domain-fees";

export class InsufficientFundsError extends Error {
  constructor(loanId: string, requestedCents: number, availableCents: number) {
    super(`Loan ${loanId} escrow has ${availableCents} cents available, cannot hold ${requestedCents} cents`);
    this.name = "InsufficientFundsError";
  }
}

/**
 * Escrow ledger (docs/REQUIREMENTS_MATRIX.md #17). Every balance-affecting operation
 * runs inside a single DB transaction that (a) locks the escrow account row with
 * `FOR UPDATE` so concurrent operations on the same loan serialize rather than race, and
 * (b) inserts an immutable `ledger_transactions` row alongside the balance update, so
 * `balance_cents`/`held_recording_fee_cents` are never mutated without a corresponding
 * permanent record — the auditability property real double-entry bookkeeping provides,
 * even though this schema models one account per loan rather than a full chart of
 * accounts (see docs/ASSUMPTIONS.md). All amounts are integer cents; never floating point
 * (docs/REQUIREMENTS_MATRIX.md #40).
 */
export async function getOrCreateEscrowAccount(
  db: Kysely<Database>,
  organizationId: string,
  loanId: string,
): Promise<{ id: string; balanceCents: number; heldRecordingFeeCents: number }> {
  const existing = await db.selectFrom("escrow_accounts").selectAll().where("loan_id", "=", loanId).executeTakeFirst();
  if (existing) return { id: existing.id, balanceCents: existing.balance_cents, heldRecordingFeeCents: existing.held_recording_fee_cents };

  const created = await db
    .insertInto("escrow_accounts")
    .values({ organization_id: organizationId, loan_id: loanId })
    .returning(["id", "balance_cents", "held_recording_fee_cents"])
    .executeTakeFirstOrThrow();
  return { id: created.id, balanceCents: created.balance_cents, heldRecordingFeeCents: created.held_recording_fee_cents };
}

async function lockEscrowAccount(trx: Transaction<Database>, escrowAccountId: string) {
  return trx
    .selectFrom("escrow_accounts")
    .selectAll()
    .where("id", "=", escrowAccountId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

export async function depositPayoff(db: Kysely<Database>, escrowAccountId: string, amountCents: number, description: string): Promise<void> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new RangeError("amountCents must be a positive integer");

  await db.transaction().execute(async (trx) => {
    const account = await lockEscrowAccount(trx, escrowAccountId);
    await trx
      .updateTable("escrow_accounts")
      .set({ balance_cents: account.balance_cents + amountCents, updated_at: new Date() })
      .where("id", "=", escrowAccountId)
      .execute();
    await trx
      .insertInto("ledger_transactions")
      .values({ escrow_account_id: escrowAccountId, type: "PAYOFF_DEPOSIT", amount_cents: amountCents, description })
      .execute();
  });
}

/** Moves `amountCents` from available balance into the held-for-recording-fee bucket. */
export async function holdRecordingFee(
  db: Kysely<Database>,
  escrowAccountId: string,
  packageId: string,
  amountCents: number,
): Promise<void> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new RangeError("amountCents must be a positive integer");

  await db.transaction().execute(async (trx) => {
    const account = await lockEscrowAccount(trx, escrowAccountId);
    if (account.balance_cents < amountCents) {
      throw new InsufficientFundsError(account.loan_id, amountCents, account.balance_cents);
    }
    await trx
      .updateTable("escrow_accounts")
      .set({
        balance_cents: account.balance_cents - amountCents,
        held_recording_fee_cents: account.held_recording_fee_cents + amountCents,
        updated_at: new Date(),
      })
      .where("id", "=", escrowAccountId)
      .execute();
    await trx
      .insertInto("ledger_transactions")
      .values({
        escrow_account_id: escrowAccountId,
        type: "RECORDING_FEE_HELD",
        amount_cents: amountCents,
        reference_package_id: packageId,
        description: `Recording fee held for package ${packageId}`,
      })
      .execute();
  });
}

export interface RemitOutcome {
  estimatedCents: number;
  actualCents: number;
  varianceCents: number;
  outcome: "BALANCED" | "REFUND_QUEUED" | "DEFICIT_COVERED";
}

/**
 * Settles a held recording fee against what the county actually charged
 * (docs/REQUIREMENTS_MATRIX.md #18). Releases `estimatedCents` from the held bucket;
 * if the county charged less, the difference is refunded back into balance; if more,
 * the shortfall is drawn from balance to cover the deficit. Records a
 * `fee_reconciliations` row and the corresponding ledger transaction(s).
 */
export async function remitRecordingFee(
  db: Kysely<Database>,
  escrowAccountId: string,
  packageId: string,
  estimatedCents: number,
  actualCents: number,
): Promise<RemitOutcome> {
  const variance = compareFeeToActual(estimatedCents, actualCents);

  await db.transaction().execute(async (trx) => {
    const account = await lockEscrowAccount(trx, escrowAccountId);

    const newHeld = account.held_recording_fee_cents - estimatedCents;
    let newBalance = account.balance_cents;
    let refundAmountCents = 0;

    if (variance.outcome === "REFUND_QUEUED") {
      refundAmountCents = -variance.varianceCents; // county charged less; positive refund amount
      newBalance += refundAmountCents;
    } else if (variance.outcome === "DEFICIT_COVERED") {
      newBalance -= variance.varianceCents; // county charged more; draw the shortfall from balance
    }

    await trx
      .updateTable("escrow_accounts")
      .set({ held_recording_fee_cents: Math.max(0, newHeld), balance_cents: newBalance, updated_at: new Date() })
      .where("id", "=", escrowAccountId)
      .execute();

    await trx
      .insertInto("ledger_transactions")
      .values({
        escrow_account_id: escrowAccountId,
        type: "RECORDING_FEE_REMITTED",
        amount_cents: actualCents,
        reference_package_id: packageId,
        description: `Recording fee remitted for package ${packageId}: estimated ${estimatedCents}, actual ${actualCents}`,
      })
      .execute();

    if (variance.outcome === "REFUND_QUEUED") {
      await trx
        .insertInto("ledger_transactions")
        .values({
          escrow_account_id: escrowAccountId,
          type: "ESCROW_REFUND_ISSUED",
          amount_cents: refundAmountCents,
          reference_package_id: packageId,
          description: `Fee overage refund for package ${packageId}`,
        })
        .execute();
    } else if (variance.outcome === "DEFICIT_COVERED") {
      await trx
        .insertInto("ledger_transactions")
        .values({
          escrow_account_id: escrowAccountId,
          type: "DEFICIT_COVERED",
          amount_cents: variance.varianceCents,
          reference_package_id: packageId,
          description: `Fee shortage covered from escrow for package ${packageId}`,
        })
        .execute();
    }

    await trx
      .insertInto("fee_reconciliations")
      .values({
        package_id: packageId,
        estimated_fee_cents: estimatedCents,
        actual_fee_cents: actualCents,
        variance_cents: variance.varianceCents,
        status: variance.outcome,
        refund_amount_cents: refundAmountCents,
      })
      .execute();
  });

  return { estimatedCents, actualCents, varianceCents: variance.varianceCents, outcome: variance.outcome };
}
