/**
 * Recording fee calculation — integer cents throughout, never floating point
 * (docs/REQUIREMENTS_MATRIX.md item #40; the transcript's own code used `parseFloat`
 * against NUMERIC columns, which this project treats as a bug to avoid, not a pattern
 * to copy).
 */
export interface FeeScheduleInputs {
  baseRecordingFeeCents: number;
  perPageFeeCents: number;
  coverPageRequired: boolean;
  coverPageFeeCents: number;
}

export interface PageCountInput {
  pageCount: number;
}

export interface FeeBreakdown {
  baseFeeCents: number;
  perPageTotalCents: number;
  coverPageFeeCents: number;
  totalCents: number;
  pageCount: number;
}

export class InvalidFeeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFeeInputError";
  }
}

export function calculateRecordingFee(schedule: FeeScheduleInputs, input: PageCountInput): FeeBreakdown {
  if (!Number.isInteger(input.pageCount) || input.pageCount < 1) {
    throw new InvalidFeeInputError(`pageCount must be a positive integer, got ${input.pageCount}`);
  }
  if (
    !Number.isInteger(schedule.baseRecordingFeeCents) ||
    !Number.isInteger(schedule.perPageFeeCents) ||
    !Number.isInteger(schedule.coverPageFeeCents)
  ) {
    throw new InvalidFeeInputError("All fee schedule amounts must be integer cents");
  }

  const perPageTotalCents = schedule.perPageFeeCents * input.pageCount;
  const coverPageFeeCents = schedule.coverPageRequired ? schedule.coverPageFeeCents : 0;
  const totalCents = schedule.baseRecordingFeeCents + perPageTotalCents + coverPageFeeCents;

  return {
    baseFeeCents: schedule.baseRecordingFeeCents,
    perPageTotalCents,
    coverPageFeeCents,
    totalCents,
    pageCount: input.pageCount,
  };
}

/**
 * Compares an estimated fee (calculated pre-submission) against the actual fee the
 * county charged, per docs/REQUIREMENTS_MATRIX.md #18. Positive variance = county
 * charged more than estimated (shortage, must be covered from escrow); negative =
 * overage (refund owed).
 */
export interface FeeVariance {
  estimatedCents: number;
  actualCents: number;
  varianceCents: number;
  outcome: "BALANCED" | "REFUND_QUEUED" | "DEFICIT_COVERED";
}

export function compareFeeToActual(estimatedCents: number, actualCents: number): FeeVariance {
  const varianceCents = actualCents - estimatedCents;
  const outcome = varianceCents === 0 ? "BALANCED" : varianceCents < 0 ? "REFUND_QUEUED" : "DEFICIT_COVERED";
  return { estimatedCents, actualCents, varianceCents, outcome };
}
