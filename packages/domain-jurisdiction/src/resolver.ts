import type { CountyRule, ResolvedJurisdictionRule, StateRule } from "./types.js";

export class UnknownJurisdictionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownJurisdictionError";
  }
}

/**
 * Merges a state rule with an optional county rule. County presence is required for fee
 * calculation (base/per-page fees only exist at the county level — see
 * docs/REQUIREMENTS_MATRIX.md #2), but jurisdiction resolution itself is still meaningful
 * with state data alone (deadline/theory/doc-type/margins/notary type), so this function
 * accepts `county: null` and fills fee fields with zero, leaving it to the fee engine
 * (domain-fees) or caller to reject a package that needs a fee estimate but has no county
 * match.
 */
export function resolveJurisdictionRule(state: StateRule, county: CountyRule | null): ResolvedJurisdictionRule {
  if (county && county.stateCode !== state.stateCode) {
    throw new UnknownJurisdictionError(
      `County ${county.countyFips} belongs to state ${county.stateCode}, not ${state.stateCode}`,
    );
  }

  return {
    stateCode: state.stateCode,
    countyFips: county?.countyFips ?? "",
    theoryType: state.theoryType,
    docType: state.defaultDocType,
    statutoryDeadlineDays: state.statutoryDeadlineDays,
    dailyPenaltyCents: state.dailyPenaltyCents,
    trusteeRequired: state.trusteeRequired,
    witnessesRequired: state.witnessesRequired,
    // County-level margin override wins when present (docs/REQUIREMENTS_MATRIX.md #2).
    topMarginInches: county?.customTopMarginInches ?? state.topMarginInches,
    bottomMarginInches: state.bottomMarginInches,
    sideMarginInches: state.sideMarginInches,
    notaryType: state.notaryType,
    eRecordingNetwork: county?.eRecordingNetwork ?? "MANUAL",
    acceptedPriaLevel: county?.acceptedPriaLevel ?? "LEVEL_1",
    coverPageRequired: county?.coverPageRequired ?? false,
    coverPageFeeCents: county?.coverPageFeeCents ?? 0,
    baseRecordingFeeCents: county?.baseRecordingFeeCents ?? 0,
    perPageFeeCents: county?.perPageFeeCents ?? 0,
    provenance: {
      stateStatus: state.status,
      countyStatus: county?.status ?? null,
    },
  };
}

/**
 * Statutory deadline = payoff/settlement date + N calendar days (docs/ASSUMPTIONS.md #8).
 * Calendar days, not business days — the transcript never specified business-day
 * adjustment and no state's data models one, so this is the documented assumption.
 */
export function calculateStatutoryDeadline(settlementDate: Date, rule: Pick<ResolvedJurisdictionRule, "statutoryDeadlineDays">): Date {
  const deadline = new Date(settlementDate.getTime());
  deadline.setUTCDate(deadline.getUTCDate() + rule.statutoryDeadlineDays);
  return deadline;
}

/**
 * Statutory penalty accrual: `dailyPenaltyCents * max(0, daysLate)`. Returns 0 for
 * states with no per-day penalty (dailyPenaltyCents === 0) or when not yet late.
 * Integer cents throughout — never floating point (docs/DECISIONS.md, item #40).
 */
export function calculateAccruedPenaltyCents(
  rule: Pick<ResolvedJurisdictionRule, "dailyPenaltyCents">,
  asOf: Date,
  deadline: Date,
): number {
  if (asOf.getTime() <= deadline.getTime()) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLate = Math.floor((asOf.getTime() - deadline.getTime()) / msPerDay);
  return rule.dailyPenaltyCents * daysLate;
}
