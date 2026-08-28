import { describe, expect, it } from "vitest";
import { calculateBackoffMs } from "./backoff.js";

describe("calculateBackoffMs", () => {
  it("doubles per attempt starting from baseMs", () => {
    expect(calculateBackoffMs(1, 5000)).toBe(5000);
    expect(calculateBackoffMs(2, 5000)).toBe(10000);
    expect(calculateBackoffMs(3, 5000)).toBe(20000);
  });

  it("caps at maxMs", () => {
    expect(calculateBackoffMs(20, 5000, 60000)).toBe(60000);
  });

  it("rejects attempt < 1", () => {
    expect(() => calculateBackoffMs(0)).toThrow(RangeError);
  });
});
