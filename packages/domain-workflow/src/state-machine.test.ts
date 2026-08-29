import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, getAllowedTransitions, IllegalTransitionError, isTerminalState } from "./state-machine.js";

describe("package state machine", () => {
  it("allows the documented happy path end to end", () => {
    const path: Parameters<typeof canTransition>[0][] = [
      "DRAFT",
      "VALIDATING",
      "READY",
      "PENDING_SIGNATURE",
      "PENDING_NOTARY",
      "READY_TO_SUBMIT",
      "SUBMITTING",
      "SUBMITTED",
      "COUNTY_PROCESSING",
      "RECORDED",
      "RECONCILING",
      "COMPLETE",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("allows the rejection/resubmission loop (matrix #23)", () => {
    expect(canTransition("COUNTY_PROCESSING", "REJECTED")).toBe(true);
    expect(canTransition("REJECTED", "RESUBMISSION_REQUIRED")).toBe(true);
    expect(canTransition("RESUBMISSION_REQUIRED", "VALIDATING")).toBe(true);
  });

  it("allows a vendor to reject a submission directly, before county acceptance (E2E scenario C)", () => {
    expect(canTransition("SUBMITTED", "REJECTED")).toBe(true);
  });

  it("allows pre-flight failure to loop back to VALIDATING", () => {
    expect(canTransition("VALIDATING", "PREFLIGHT_FAILED")).toBe(true);
    expect(canTransition("PREFLIGHT_FAILED", "VALIDATING")).toBe(true);
  });

  it("rejects skipping states", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(false);
    expect(() => assertTransition("DRAFT", "SUBMITTED")).toThrow(IllegalTransitionError);
  });

  it("allows CANCELLED from any non-terminal state", () => {
    expect(canTransition("DRAFT", "CANCELLED")).toBe(true);
    expect(canTransition("PENDING_NOTARY", "CANCELLED")).toBe(true);
    expect(canTransition("RECONCILING", "CANCELLED")).toBe(true);
  });

  it("disallows any transition out of a terminal state", () => {
    expect(getAllowedTransitions("COMPLETE")).toEqual([]);
    expect(getAllowedTransitions("CANCELLED")).toEqual([]);
    expect(getAllowedTransitions("FAILED")).toEqual([]);
    expect(isTerminalState("COMPLETE")).toBe(true);
    expect(isTerminalState("DRAFT")).toBe(false);
  });

  it("allows FAILED only from active vendor/system-work states", () => {
    expect(canTransition("SUBMITTING", "FAILED")).toBe(true);
    expect(canTransition("COUNTY_PROCESSING", "FAILED")).toBe(true);
    expect(canTransition("DRAFT", "FAILED")).toBe(false);
  });
});
