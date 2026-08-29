import { checkDeadlinesForBatch } from "@project-lien/domain-escrow";
import { dispatchWebhookEvent, enqueueJob, isTerminalState } from "@project-lien/domain-workflow";
import type { PackageStatus } from "@project-lien/db";
import type { JobHandler } from "./types.js";

const SCAN_INTERVAL_MS = 60 * 60 * 1000; // hourly — see docs/LOCAL_DEVELOPMENT.md for how to trigger a scan sooner in dev

/**
 * Statutory deadline & penalty monitoring scan (docs/REQUIREMENTS_MATRIX.md #19, E2E
 * scenario G). Self-reschedules after each run rather than using a cron-style trigger,
 * consistent with this project's DB-backed-queue-over-Temporal decision
 * (docs/DECISIONS.md D3): a "recurring job" is just a job that enqueues its own next run
 * on completion. Writes a `workflow_events` row (actor SYSTEM) for every package that is
 * APPROACHING_DEADLINE or PAST_DEADLINE so the exception center (Phase 11) has a feed to
 * read from — it does not maintain its own dedicated alert table.
 *
 * Dedupes on `riskLevel`: a package already flagged at its current risk level is not
 * re-notified on every subsequent tick (scenario G's "fires once, not on every scheduler
 * tick") — it's only re-notified if its risk level has since escalated (e.g.
 * APPROACHING_DEADLINE -> PAST_DEADLINE), by checking the most recent scan event recorded
 * for that package rather than a separate dedicated alert-state table.
 */
export const statutoryDeadlineScanHandler: JobHandler = async (_payload, { db, logger }) => {
  const packages = await db
    .selectFrom("recording_packages")
    .innerJoin("state_jurisdiction_rules", "state_jurisdiction_rules.state_code", "recording_packages.state_code")
    .select([
      "recording_packages.id as packageId",
      "recording_packages.organization_id as organizationId",
      "recording_packages.status as status",
      "recording_packages.statutory_deadline as statutoryDeadline",
      "state_jurisdiction_rules.daily_penalty_cents as dailyPenaltyCents",
    ])
    .execute();

  const active = packages.filter((p) => !isTerminalState(p.status as PackageStatus));
  const results = checkDeadlinesForBatch(
    active.map((p) => ({ packageId: p.packageId, statutoryDeadline: new Date(p.statutoryDeadline), dailyPenaltyCents: p.dailyPenaltyCents })),
    new Date(),
  );

  const atRisk = results.filter((r) => r.riskLevel !== "ON_TRACK");
  let notified = 0;
  for (const risk of atRisk) {
    const pkg = active.find((p) => p.packageId === risk.packageId)!;

    const lastScanEvent = await db
      .selectFrom("workflow_events")
      .select(["metadata"])
      .where("package_id", "=", risk.packageId)
      .where("reason", "like", "Statutory deadline scan:%")
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    const lastRiskLevel = (lastScanEvent?.metadata as { riskLevel?: string } | null)?.riskLevel;
    if (lastRiskLevel === risk.riskLevel) continue; // already notified at this risk level — do not re-fire every tick

    await db
      .insertInto("workflow_events")
      .values({
        package_id: risk.packageId,
        from_status: null,
        to_status: pkg.status as PackageStatus,
        actor: "SYSTEM",
        reason: `Statutory deadline scan: ${risk.riskLevel} (${risk.daysUntilDeadline} days, accrued penalty ${risk.accruedPenaltyCents} cents)`,
        metadata: JSON.stringify(risk),
      })
      .execute();

    await dispatchWebhookEvent(db, pkg.organizationId, "deadline.at_risk", {
      packageId: risk.packageId,
      riskLevel: risk.riskLevel,
      daysUntilDeadline: risk.daysUntilDeadline,
      accruedPenaltyCents: risk.accruedPenaltyCents,
    });
    notified += 1;
  }

  logger.info({ scanned: active.length, atRisk: atRisk.length, notified }, "statutory deadline scan complete");

  await enqueueJob(db, {
    packageId: null,
    jobType: "STATUTORY_DEADLINE_SCAN",
    payload: {},
    availableAt: new Date(Date.now() + SCAN_INTERVAL_MS),
  });
};
