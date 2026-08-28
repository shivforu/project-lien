import { checkDeadlinesForBatch } from "@project-lien/domain-escrow";
import { enqueueJob, isTerminalState } from "@project-lien/domain-workflow";
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
 */
export const statutoryDeadlineScanHandler: JobHandler = async (_payload, { db, logger }) => {
  const packages = await db
    .selectFrom("recording_packages")
    .innerJoin("state_jurisdiction_rules", "state_jurisdiction_rules.state_code", "recording_packages.state_code")
    .select([
      "recording_packages.id as packageId",
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
  for (const risk of atRisk) {
    await db
      .insertInto("workflow_events")
      .values({
        package_id: risk.packageId,
        from_status: null,
        to_status: active.find((p) => p.packageId === risk.packageId)!.status as PackageStatus,
        actor: "SYSTEM",
        reason: `Statutory deadline scan: ${risk.riskLevel} (${risk.daysUntilDeadline} days, accrued penalty ${risk.accruedPenaltyCents} cents)`,
        metadata: JSON.stringify(risk),
      })
      .execute();
  }

  logger.info({ scanned: active.length, atRisk: atRisk.length }, "statutory deadline scan complete");

  await enqueueJob(db, {
    packageId: null,
    jobType: "STATUTORY_DEADLINE_SCAN",
    payload: {},
    availableAt: new Date(Date.now() + SCAN_INTERVAL_MS),
  });
};
