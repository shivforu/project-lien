import { calculateAccruedPenaltyCents } from "@project-lien/domain-jurisdiction";

export type DeadlineRiskLevel = "ON_TRACK" | "APPROACHING_DEADLINE" | "PAST_DEADLINE";

export interface DeadlineCheckInput {
  packageId: string;
  statutoryDeadline: Date;
  dailyPenaltyCents: number;
}

export interface DeadlineCheckResult {
  packageId: string;
  riskLevel: DeadlineRiskLevel;
  daysUntilDeadline: number;
  accruedPenaltyCents: number;
}

/**
 * Statutory deadline & penalty monitoring (docs/REQUIREMENTS_MATRIX.md #19). Pure
 * function over already-fetched package/rule data so it's unit-testable without a DB;
 * the DB-backed scan that calls this for every active package is
 * `findPackagesApproachingOrPastDeadline`'s caller (apps/worker's STATUTORY_DEADLINE_SCAN
 * job). `warningWindowDays` controls how far ahead of the deadline a package is flagged
 * APPROACHING_DEADLINE (E2E scenario G).
 */
export function checkDeadline(input: DeadlineCheckInput, asOf: Date, warningWindowDays = 7): DeadlineCheckResult {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDeadline = Math.ceil((input.statutoryDeadline.getTime() - asOf.getTime()) / msPerDay);

  const riskLevel: DeadlineRiskLevel =
    daysUntilDeadline < 0 ? "PAST_DEADLINE" : daysUntilDeadline <= warningWindowDays ? "APPROACHING_DEADLINE" : "ON_TRACK";

  const accruedPenaltyCents = calculateAccruedPenaltyCents({ dailyPenaltyCents: input.dailyPenaltyCents }, asOf, input.statutoryDeadline);

  return { packageId: input.packageId, riskLevel, daysUntilDeadline, accruedPenaltyCents };
}

export function checkDeadlinesForBatch(inputs: DeadlineCheckInput[], asOf: Date, warningWindowDays = 7): DeadlineCheckResult[] {
  return inputs.map((input) => checkDeadline(input, asOf, warningWindowDays));
}
