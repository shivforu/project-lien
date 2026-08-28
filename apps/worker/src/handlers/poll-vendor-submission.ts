import { assertTransition, enqueueJob } from "@project-lien/domain-workflow";
import type { PackageStatus, VendorSubmissionStatus } from "@project-lien/db";
import { erecordingRouter } from "../vendor-router.js";
import type { JobHandler } from "./types.js";

export interface PollVendorSubmissionPayload {
  vendorSubmissionId: string;
}

/**
 * Polls a vendor for the status of a submitted package (docs/REQUIREMENTS_MATRIX.md
 * #15, #21) and advances the package state machine when the vendor reports a terminal
 * outcome. Re-enqueues itself with a short delay while the vendor still reports
 * SUBMITTED (i.e. this is a genuine polling loop, not a one-shot check) — real vendors
 * do not push webhooks for every status in this project's mock adapters, so polling is
 * the only mechanism modeled here (see docs/EXTERNAL_DEPENDENCIES.md).
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

  if (nextStatus === pkg.status) {
    logger.info({ vendorSubmissionId, status: nextStatus }, "package already in target status, no transition needed");
    return;
  }

  assertTransition(pkg.status, nextStatus);

  await db
    .updateTable("recording_packages")
    .set({
      status: nextStatus,
      rejection_reason: result.status === "REJECTED" ? (result.rejectionReason ?? "Rejected by vendor/county") : null,
      county_tracking_number: result.countyTrackingId ?? pkg.county_tracking_number,
      recorded_instrument_number: result.recordedInstrumentNumber ?? pkg.recorded_instrument_number,
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
};
