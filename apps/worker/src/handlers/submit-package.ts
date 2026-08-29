import { findCountyRule, findStateRule, resolveJurisdictionRule } from "@project-lien/domain-jurisdiction";
import { calculateRecordingFee } from "@project-lien/domain-fees";
import { renderDocumentHtml, renderHtmlToPdf, checkMarginCompliance } from "@project-lien/domain-documents";
import { serializePriaPackageToXml } from "@project-lien/domain-pria";
import { assertTransition, dispatchWebhookEvent, enqueueJob } from "@project-lien/domain-workflow";
import { getOrCreateEscrowAccount, depositPayoff, holdRecordingFee } from "@project-lien/domain-escrow";
import { erecordingRouter } from "../vendor-router.js";
import type { JobHandler } from "./types.js";

export interface SubmitPackagePayload {
  packageId: string;
}

/**
 * Submits a package to its resolved eRecording vendor (docs/REQUIREMENTS_MATRIX.md #11,
 * #15, #21) — the first time Phase 3's document engine, Phase 4's PRIA serializer, and
 * Phase 5's vendor router are actually chained together in a real code path, rather than
 * each being exercised only by its own package's unit tests. Runs as a job (not inline on
 * the API request) because it calls an external vendor adapter (docs/DECISIONS.md D3).
 *
 * Also holds the estimated recording fee in escrow before submitting, auto-funding the
 * escrow account from the loan's unpaid principal if it isn't already funded — this
 * project does not yet model a dedicated "payoff received" trigger that would normally
 * fund escrow ahead of submission (docs/DECISIONS.md D17).
 */
export const submitPackageHandler: JobHandler = async (rawPayload, { db, logger }) => {
  const { packageId } = rawPayload as SubmitPackagePayload;

  const pkg = await db.selectFrom("recording_packages").selectAll().where("id", "=", packageId).executeTakeFirstOrThrow();
  if (pkg.status !== "READY_TO_SUBMIT") {
    logger.info({ packageId, status: pkg.status }, "package no longer READY_TO_SUBMIT, skipping submit (already processed)");
    return;
  }

  const [loan, property, org] = await Promise.all([
    db.selectFrom("loans").selectAll().where("id", "=", pkg.loan_id).executeTakeFirstOrThrow(),
    db.selectFrom("properties").selectAll().where("id", "=", pkg.property_id).executeTakeFirstOrThrow(),
    db.selectFrom("organizations").selectAll().where("id", "=", pkg.organization_id).executeTakeFirstOrThrow(),
  ]);
  const state = await findStateRule(db, pkg.state_code);
  if (!state) throw new Error(`No jurisdiction rule for state '${pkg.state_code}'`);
  const county = await findCountyRule(db, pkg.county_fips);
  const resolved = resolveJurisdictionRule(state, county);

  assertTransition(pkg.status, "SUBMITTING");
  await db.updateTable("recording_packages").set({ status: "SUBMITTING", updated_at: new Date() }).where("id", "=", pkg.id).execute();
  await db
    .insertInto("workflow_events")
    .values({ package_id: pkg.id, from_status: "READY_TO_SUBMIT", to_status: "SUBMITTING", actor: "SYSTEM", reason: "Submission started", metadata: null })
    .execute();

  const html = renderDocumentHtml(
    {
      docType: pkg.document_type,
      stateName: state.stateName,
      countyName: property.county_name,
      borrowerName: loan.borrower_name,
      lenderName: org.name,
      propertyAddress: `${property.address_line1}, ${property.city}, ${property.state_code} ${property.zip_code}`,
      legalDescription: "See recorded instrument reference for full legal description.",
      originalInstrumentNumber: loan.original_instrument_number,
      originalBook: loan.original_book,
      originalPage: loan.original_page,
      loanAmountCents: loan.unpaid_principal_cents,
      trusteeName: null,
      witnessNames: [],
      packageIdentifier: pkg.package_identifier,
    },
    resolved.topMarginInches,
  );
  const pdfBytes = await renderHtmlToPdf(html);
  const margins = await checkMarginCompliance(pdfBytes, resolved.topMarginInches);
  const pageCount = margins.pages.length;

  const estimatedFeeCents = calculateRecordingFee(
    {
      baseRecordingFeeCents: resolved.baseRecordingFeeCents,
      perPageFeeCents: resolved.perPageFeeCents,
      coverPageRequired: resolved.coverPageRequired,
      coverPageFeeCents: resolved.coverPageFeeCents,
    },
    { pageCount },
  ).totalCents;

  const account = await getOrCreateEscrowAccount(db, pkg.organization_id, pkg.loan_id);
  const fundingNeeded = Math.max(0, estimatedFeeCents - account.balanceCents);
  if (fundingNeeded > 0) {
    await depositPayoff(db, account.id, fundingNeeded, `Auto-funded escrow for package ${pkg.id} recording fee hold (docs/DECISIONS.md D17)`);
  }
  await holdRecordingFee(db, account.id, pkg.id, estimatedFeeCents);

  const priaXml = serializePriaPackageToXml({
    packageIdentifier: pkg.package_identifier,
    priaLevel: resolved.acceptedPriaLevel,
    documentType: pkg.document_type,
    submitter: {
      name: org.name,
      contactEmail: `ops@${org.slug}.example`,
      returnAddressLine1: property.address_line1,
      returnCity: property.city,
      returnStateCode: property.state_code,
      returnZip: property.zip_code,
    },
    jurisdiction: { stateCode: pkg.state_code, countyFips: pkg.county_fips, countyName: property.county_name },
    property: {
      parcelNumber: property.parcel_number,
      addressLine1: property.address_line1,
      city: property.city,
      zip: property.zip_code,
      legalDescription: "See recorded instrument reference for full legal description.",
    },
    reference: {
      originalInstrumentNumber: loan.original_instrument_number,
      originalBook: loan.original_book,
      originalPage: loan.original_page,
    },
    parties: [
      { role: "GRANTOR", isOrganization: false, name: loan.borrower_name },
      { role: "SUBMITTER", isOrganization: true, name: org.name },
    ],
    pageCount,
  });

  const provider = erecordingRouter.resolve(resolved.eRecordingNetwork);
  const idempotencyKey = `submit-${pkg.id}`;
  const submitResult = await provider.submit({
    packageId: pkg.id,
    network: resolved.eRecordingNetwork,
    priaXml,
    documentPdfBase64: Buffer.from(pdfBytes).toString("base64"),
    idempotencyKey,
    estimatedFeeCents,
  });

  const submission = await db
    .insertInto("vendor_submissions")
    .values({
      package_id: pkg.id,
      network: resolved.eRecordingNetwork,
      vendor_tracking_id: submitResult.vendorTrackingId,
      status: submitResult.status === "REJECTED" ? "REJECTED" : "SUBMITTED",
      request_payload: JSON.stringify({ estimatedFeeCents, idempotencyKey }),
      rejection_reason: submitResult.rejectionReason ?? null,
      submitted_at: new Date(),
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  if (submitResult.status === "REJECTED") {
    assertTransition("SUBMITTING", "REJECTED");
    await db
      .updateTable("recording_packages")
      .set({ status: "REJECTED", rejection_reason: submitResult.rejectionReason ?? "Rejected at submission", updated_at: new Date() })
      .where("id", "=", pkg.id)
      .execute();
    await db
      .insertInto("workflow_events")
      .values({ package_id: pkg.id, from_status: "SUBMITTING", to_status: "REJECTED", actor: "SYSTEM", reason: "Vendor rejected at submission", metadata: null })
      .execute();
    await dispatchWebhookEvent(db, pkg.organization_id, "recording.rejected", { packageId: pkg.id, reason: submitResult.rejectionReason });
    logger.info({ packageId: pkg.id }, "package rejected at submission");
    return;
  }

  assertTransition("SUBMITTING", "SUBMITTED");
  await db
    .updateTable("recording_packages")
    .set({ status: "SUBMITTED", submitted_at: new Date(), updated_at: new Date() })
    .where("id", "=", pkg.id)
    .execute();
  await db
    .insertInto("workflow_events")
    .values({ package_id: pkg.id, from_status: "SUBMITTING", to_status: "SUBMITTED", actor: "SYSTEM", reason: "Submitted to vendor", metadata: null })
    .execute();

  await dispatchWebhookEvent(db, pkg.organization_id, "recording.submitted", { packageId: pkg.id, network: resolved.eRecordingNetwork });

  await enqueueJob(db, {
    packageId: pkg.id,
    jobType: "POLL_VENDOR_SUBMISSION",
    payload: { vendorSubmissionId: submission.id },
    availableAt: new Date(Date.now() + 5_000),
  });

  logger.info({ packageId: pkg.id, vendorTrackingId: submitResult.vendorTrackingId }, "package submitted to vendor");
};
