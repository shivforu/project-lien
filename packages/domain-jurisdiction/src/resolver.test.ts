import { describe, expect, it } from "vitest";
import {
  calculateAccruedPenaltyCents,
  calculateStatutoryDeadline,
  resolveJurisdictionRule,
  UnknownJurisdictionError,
} from "./resolver.js";
import type { CountyRule, StateRule } from "./types.js";

const CA: StateRule = {
  stateCode: "CA",
  stateName: "California",
  theoryType: "TITLE_THEORY",
  defaultDocType: "DEED_OF_RECONVEYANCE",
  statutoryDeadlineDays: 30,
  dailyPenaltyCents: 50000,
  trusteeRequired: true,
  witnessesRequired: 0,
  topMarginInches: 3.0,
  bottomMarginInches: 0.5,
  sideMarginInches: 0.5,
  notaryType: "CALIFORNIA_JURAT",
  status: "UNVERIFIED",
};

const LOS_ANGELES: CountyRule = {
  countyFips: "06037",
  stateCode: "CA",
  countyName: "Los Angeles",
  baseRecordingFeeCents: 7500,
  perPageFeeCents: 300,
  coverPageRequired: true,
  coverPageFeeCents: 100,
  acceptedPriaLevel: "LEVEL_2",
  customTopMarginInches: 2.5,
  eRecordingNetwork: "SIMPLIFILE",
  status: "UNVERIFIED",
};

describe("resolveJurisdictionRule", () => {
  it("merges state + county, with county margin override winning", () => {
    const resolved = resolveJurisdictionRule(CA, LOS_ANGELES);
    expect(resolved.topMarginInches).toBe(2.5);
    expect(resolved.docType).toBe("DEED_OF_RECONVEYANCE");
    expect(resolved.eRecordingNetwork).toBe("SIMPLIFILE");
    expect(resolved.baseRecordingFeeCents).toBe(7500);
    expect(resolved.provenance).toEqual({ stateStatus: "UNVERIFIED", countyStatus: "UNVERIFIED" });
  });

  it("falls back to state margin when county has no override", () => {
    const noOverride: CountyRule = { ...LOS_ANGELES, customTopMarginInches: null };
    const resolved = resolveJurisdictionRule(CA, noOverride);
    expect(resolved.topMarginInches).toBe(3.0);
  });

  it("resolves with state data alone (no county match yet)", () => {
    const resolved = resolveJurisdictionRule(CA, null);
    expect(resolved.countyFips).toBe("");
    expect(resolved.eRecordingNetwork).toBe("MANUAL");
    expect(resolved.baseRecordingFeeCents).toBe(0);
    expect(resolved.provenance.countyStatus).toBeNull();
  });

  it("rejects a county that belongs to a different state", () => {
    const wrongState: CountyRule = { ...LOS_ANGELES, stateCode: "TX" };
    expect(() => resolveJurisdictionRule(CA, wrongState)).toThrow(UnknownJurisdictionError);
  });
});

describe("calculateStatutoryDeadline", () => {
  it("adds calendar days to the settlement date", () => {
    const deadline = calculateStatutoryDeadline(new Date("2026-01-01T00:00:00Z"), { statutoryDeadlineDays: 30 });
    expect(deadline.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
});

describe("calculateAccruedPenaltyCents", () => {
  const deadline = new Date("2026-01-31T00:00:00Z");

  it("is zero before or on the deadline", () => {
    expect(calculateAccruedPenaltyCents({ dailyPenaltyCents: 50000 }, new Date("2026-01-31T00:00:00Z"), deadline)).toBe(0);
    expect(calculateAccruedPenaltyCents({ dailyPenaltyCents: 50000 }, new Date("2026-01-15T00:00:00Z"), deadline)).toBe(0);
  });

  it("accrues dailyPenaltyCents per full day late", () => {
    const fiveDaysLate = new Date("2026-02-05T00:00:00Z");
    expect(calculateAccruedPenaltyCents({ dailyPenaltyCents: 50000 }, fiveDaysLate, deadline)).toBe(250000);
  });

  it("is zero for states with no per-day penalty", () => {
    const tenDaysLate = new Date("2026-02-10T00:00:00Z");
    expect(calculateAccruedPenaltyCents({ dailyPenaltyCents: 0 }, tenDaysLate, deadline)).toBe(0);
  });
});
