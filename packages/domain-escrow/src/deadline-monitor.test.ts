import { describe, expect, it } from "vitest";
import { checkDeadline, checkDeadlinesForBatch } from "./deadline-monitor.js";

describe("checkDeadline", () => {
  const deadline = new Date("2026-06-30T00:00:00Z");

  it("is ON_TRACK well before the deadline", () => {
    const result = checkDeadline({ packageId: "p1", statutoryDeadline: deadline, dailyPenaltyCents: 50000 }, new Date("2026-06-01T00:00:00Z"));
    expect(result.riskLevel).toBe("ON_TRACK");
    expect(result.accruedPenaltyCents).toBe(0);
  });

  it("is APPROACHING_DEADLINE within the warning window", () => {
    const result = checkDeadline({ packageId: "p1", statutoryDeadline: deadline, dailyPenaltyCents: 50000 }, new Date("2026-06-25T00:00:00Z"), 7);
    expect(result.riskLevel).toBe("APPROACHING_DEADLINE");
    expect(result.daysUntilDeadline).toBe(5);
  });

  it("is PAST_DEADLINE and accrues penalty after the deadline", () => {
    const result = checkDeadline({ packageId: "p1", statutoryDeadline: deadline, dailyPenaltyCents: 50000 }, new Date("2026-07-05T00:00:00Z"));
    expect(result.riskLevel).toBe("PAST_DEADLINE");
    expect(result.accruedPenaltyCents).toBe(250000);
  });
});

describe("checkDeadlinesForBatch", () => {
  it("classifies a mixed batch independently", () => {
    const asOf = new Date("2026-06-25T00:00:00Z");
    const results = checkDeadlinesForBatch(
      [
        { packageId: "on-track", statutoryDeadline: new Date("2026-08-01T00:00:00Z"), dailyPenaltyCents: 0 },
        { packageId: "approaching", statutoryDeadline: new Date("2026-06-28T00:00:00Z"), dailyPenaltyCents: 0 },
        { packageId: "past", statutoryDeadline: new Date("2026-06-20T00:00:00Z"), dailyPenaltyCents: 10000 },
      ],
      asOf,
    );
    expect(results.map((r) => r.riskLevel)).toEqual(["ON_TRACK", "APPROACHING_DEADLINE", "PAST_DEADLINE"]);
  });
});
