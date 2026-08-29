import { assertTransition, dispatchWebhookEvent } from "@project-lien/domain-workflow";
import { getOrCreateEscrowAccount, remitRecordingFee } from "@project-lien/domain-escrow";
import type { JobHandler } from "./types.js";

export interface ReconcileFeePayload {
  packageId: string;
}

/**
 * Settles the escrow-held recording fee against what the county actually charged
 * (docs/REQUIREMENTS_MATRIX.md #18, docs/TEST_STRATEGY.md scenarios H/I), then completes
 * the package. Runs after `POLL_VENDOR_SUBMISSION` observes a RECORDED outcome — see
 * `poll-vendor-submission.ts`, which stores the vendor-reported actual fee on the package
 * and enqueues this job.
 */
export const reconcileFeeHandler: JobHandler = async (rawPayload, { db, logger }) => {
  const { packageId } = rawPayload as ReconcileFeePayload;

  const pkg = await db.selectFrom("recording_packages").selectAll().where("id", "=", packageId).executeTakeFirstOrThrow();
  if (pkg.status !== "RECORDED") {
    logger.info({ packageId, status: pkg.status }, "package no longer RECORDED, skipping reconciliation (already processed)");
    return;
  }
  if (pkg.recording_fee_charged_cents === null) {
    logger.warn({ packageId }, "no actual fee reported by vendor — skipping fee reconciliation, completing package as-is");
  }

  const submission = await db
    .selectFrom("vendor_submissions")
    .selectAll()
    .where("package_id", "=", packageId)
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  const estimatedFeeCents = (submission?.request_payload as { estimatedFeeCents?: number } | null)?.estimatedFeeCents ?? null;

  assertTransition("RECORDED", "RECONCILING");
  await db.updateTable("recording_packages").set({ status: "RECONCILING", updated_at: new Date() }).where("id", "=", pkg.id).execute();
  await db
    .insertInto("workflow_events")
    .values({ package_id: pkg.id, from_status: "RECORDED", to_status: "RECONCILING", actor: "SYSTEM", reason: "Fee reconciliation started", metadata: null })
    .execute();

  if (estimatedFeeCents !== null && pkg.recording_fee_charged_cents !== null) {
    const account = await getOrCreateEscrowAccount(db, pkg.organization_id, pkg.loan_id);
    const outcome = await remitRecordingFee(db, account.id, pkg.id, estimatedFeeCents, pkg.recording_fee_charged_cents);
    logger.info({ packageId: pkg.id, outcome }, "fee reconciled");
    if (outcome.outcome !== "BALANCED") {
      await dispatchWebhookEvent(db, pkg.organization_id, "fee.adjusted", {
        packageId: pkg.id,
        estimatedCents: outcome.estimatedCents,
        actualCents: outcome.actualCents,
        varianceCents: outcome.varianceCents,
        outcome: outcome.outcome,
      });
    }
  }

  assertTransition("RECONCILING", "COMPLETE");
  await db
    .updateTable("recording_packages")
    .set({ status: "COMPLETE", completed_at: new Date(), updated_at: new Date() })
    .where("id", "=", pkg.id)
    .execute();
  await db
    .insertInto("workflow_events")
    .values({ package_id: pkg.id, from_status: "RECONCILING", to_status: "COMPLETE", actor: "SYSTEM", reason: "Package complete", metadata: null })
    .execute();

  await dispatchWebhookEvent(db, pkg.organization_id, "recording.completed", { packageId: pkg.id });
  logger.info({ packageId: pkg.id }, "package complete");
};
