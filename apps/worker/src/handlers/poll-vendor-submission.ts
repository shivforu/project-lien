import { assertTransition, dispatchWebhookEvent, enqueueJob } from "@project-lien/domain-workflow";
import type { PackageStatus, VendorSubmissionStatus } from "@project-lien/db";
import { erecordingRouter } from "../vendor-router.js";
import type { JobHandler } from "./types.js";

export interface PollVendorSubmissionPayload {
  vendorSubmissionId: string;
}

/**
 * Polls a vendor for the status of a submitted package (docs/REQUIREMENTS_MATRIX.md
 * #15, #21) and advances the package state machine as the vendor's own status
 * progresses. Re-enqueues itself with a short delay for every *non-terminal* vendor
 * status — SUBMITTED and ACCEPTED alike — since a real vendor takes an unpredictable
 * amount of time to move from "accepted by the vendor" to "recorded by the county"; only
 * RECORDED and REJECTED stop the polling loop. Real vendors do not push webhooks for
 * every status in this project's mock adapters, so polling is the only mechanism modeled
 * here (see docs/EXTERNAL_DEPENDENCIES.md).
 */
export const pollVendorSubmissionHandler: JobHandler = async (rawPayload, { db, logger }) => {
  const { vendorSubmissionId } = rawPayload as PollVendorSubmissionPayload;

  const submission = await db
    .selectFrom("vendor_submissions")
    .selectAll()
    .where("id", "=", vendorSubmissionId)
    .executeTakeFirst();
  if (!submission) throw new Error(`vendor_submission ${vendorSubmissionId} not found`);
  if (!submission.vendor_tracking_id) {
    throw new Error(`vendor_submission ${submission.id} has no vendor_tracking_id yet — cannot poll`);
  }

  const provider = erecordingRouter.resolve(submission.network);
  const result = await provider.pollStatus(submission.vendor_tracking_id);

  await db
    .insertInto("vendor_events")
    .values({ vendor_submission_id: submission.id, event_type: "POLLED", payload: JSON.stringify(result) })
    .execute();

  const isTerminalVendorStatus = result.status === "RECORDED" || result.status === "REJECTED";

  if (result.status === "SUBMITTED") {
    logger.info({ vendorSubmissionId }, "vendor submission still pending, scheduling re-poll");
    await enqueueJob(db, {
      packageId: submission.package_id,
      jobType: "POLL_VENDOR_SUBMISSION",
      payload: { vendorSubmissionId },
      availableAt: new Date(Date.now() + 30_000),
    });
    return;
  }

  const vendorSubmissionStatus: VendorSubmissionStatus = result.status === "REJECTED" ? "REJECTED" : "ACCEPTED";
  await db
    .updateTable("vendor_submissions")
    .set({ status: vendorSubmissionStatus, county_tracking_id: result.countyTrackingId ?? null, responded_at: new Date() })
    .where("id", "=", submission.id)
    .execute();

  const pkg = await db
    .selectFrom("recording_packages")
    .selectAll()
    .where("id", "=", submission.package_id)
    .executeTakeFirstOrThrow();

  const nextStatus: PackageStatus =
    result.status === "REJECTED" ? "REJECTED" : result.status === "RECORDED" ? "RECORDED" : "COUNTY_PROCESSING";

  if (nextStatus !== pkg.status) {
    assertTransition(pkg.status, nextStatus);

    await db
      .updateTable("recording_packages")
      .set({
        status: nextStatus,
        rejection_reason: result.status === "REJECTED" ? (result.rejectionReason ?? "Rejected by vendor/county") : null,
        county_tracking_number: result.countyTrackingId ?? pkg.county_tracking_number,
        recorded_instrument_number: result.recordedInstrumentNumber ?? pkg.recorded_instrument_number,
        recording_fee_charged_cents: result.actualFeeCents ?? pkg.recording_fee_charged_cents,
        recorded_at: result.status === "RECORDED" ? new Date() : pkg.recorded_at,
        updated_at: new Date(),
      })
      .where("id", "=", pkg.id)
      .execute();

    await db
      .insertInto("workflow_events")
      .values({
        package_id: pkg.id,
        from_status: pkg.status,
        to_status: nextStatus,
        actor: "SYSTEM",
        reason: `Vendor poll: ${result.status}`,
        metadata: JSON.stringify(result),
      })
      .execute();

    logger.info({ packageId: pkg.id, from: pkg.status, to: nextStatus }, "package transitioned via vendor poll");

    await dispatchWebhookEvent(db, pkg.organization_id, "package.status_changed", {
      packageId: pkg.id,
      fromStatus: pkg.status,
      toStatus: nextStatus,
    });
  } else {
    logger.info({ vendorSubmissionId, status: nextStatus }, "package already in target status, no transition needed");
  }

  if (!isTerminalVendorStatus) {
    // ACCEPTED is not terminal for polling purposes — the county can still take an
    // unpredictable amount of time to move from "accepted" to "recorded", so keep
    // polling exactly as the SUBMITTED branch above does.
    logger.info({ vendorSubmissionId }, "vendor submission accepted but not yet recorded, scheduling re-poll");
    await enqueueJob(db, {
      packageId: submission.package_id,
      jobType: "POLL_VENDOR_SUBMISSION",
      payload: { vendorSubmissionId },
      availableAt: new Date(Date.now() + 30_000),
    });
    return;
  }

  if (nextStatus === "RECORDED") {
    await dispatchWebhookEvent(db, pkg.organization_id, "recording.recorded", { packageId: pkg.id });
    // Fee reconciliation (docs/REQUIREMENTS_MATRIX.md #18) and package completion happen
    // as their own job, not inline here, so a reconciliation failure never re-triggers a
    // vendor poll retry (docs/DECISIONS.md D3 — jobs should each do one idempotent unit
    // of work).
    await enqueueJob(db, {
      packageId: pkg.id,
      jobType: "RECONCILE_FEE",
      payload: { packageId: pkg.id },
      idempotencyKey: `reconcile-fee-${pkg.id}`,
    });
  }
};
