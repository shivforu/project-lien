import { describe, expect, it } from "vitest";
import { calculateRecordingFee, compareFeeToActual, InvalidFeeInputError } from "./calculator.js";

const SCHEDULE = { baseRecordingFeeCents: 7500, perPageFeeCents: 300, coverPageRequired: true, coverPageFeeCents: 100 };

describe("calculateRecordingFee", () => {
  it("computes base + per-page + cover-page", () => {
    const result = calculateRecordingFee(SCHEDULE, { pageCount: 4 });
    expect(result).toEqual({
      baseFeeCents: 7500,
      perPageTotalCents: 1200,
      coverPageFeeCents: 100,
      totalCents: 8800,
      pageCount: 4,
    });
  });

  it("omits the cover-page fee when not required", () => {
    const result = calculateRecordingFee({ ...SCHEDULE, coverPageRequired: false }, { pageCount: 2 });
    expect(result.coverPageFeeCents).toBe(0);
    expect(result.totalCents).toBe(7500 + 600);
  });

  it("rejects a zero or negative page count", () => {
    expect(() => calculateRecordingFee(SCHEDULE, { pageCount: 0 })).toThrow(InvalidFeeInputError);
    expect(() => calculateRecordingFee(SCHEDULE, { pageCount: -1 })).toThrow(InvalidFeeInputError);
  });

  it("rejects a non-integer page count", () => {
    expect(() => calculateRecordingFee(SCHEDULE, { pageCount: 2.5 })).toThrow(InvalidFeeInputError);
  });

  it("rejects non-integer fee schedule amounts (guards against float cents)", () => {
    expect(() => calculateRecordingFee({ ...SCHEDULE, baseRecordingFeeCents: 75.5 }, { pageCount: 1 })).toThrow(
      InvalidFeeInputError,
    );
  });
});

describe("compareFeeToActual", () => {
  it("is BALANCED when equal", () => {
    expect(compareFeeToActual(8800, 8800).outcome).toBe("BALANCED");
  });

  it("is REFUND_QUEUED when the county charged less than estimated", () => {
    const v = compareFeeToActual(8800, 8000);
    expect(v.outcome).toBe("REFUND_QUEUED");
    expect(v.varianceCents).toBe(-800);
  });

  it("is DEFICIT_COVERED when the county charged more than estimated", () => {
    const v = compareFeeToActual(8800, 9200);
    expect(v.outcome).toBe("DEFICIT_COVERED");
    expect(v.varianceCents).toBe(400);
  });
});
