import { describe, expect, it } from "vitest";
import type { ILosConnector, LosLoanRecord } from "./types.js";

const SAMPLE_LOAN: LosLoanRecord = {
  externalLoanId: "LOS-EXT-1",
  borrowerName: "Jane Borrower",
  unpaidPrincipalCents: 0,
  propertyAddressLine1: "1 Main St",
  propertyStateCode: "CA",
  propertyCountyFips: "06037",
};

/**
 * Shared contract suite any `ILosConnector` implementation must pass — mirrors the
 * pattern established for eRecording adapters.
 */
export function runLosConnectorContractTests(label: string, makeConnector: (seedLoans: LosLoanRecord[]) => ILosConnector): void {
  describe(`ILosConnector contract: ${label}`, () => {
    it("pulls a seeded loan record by external id", async () => {
      const connector = makeConnector([SAMPLE_LOAN]);
      const record = await connector.pullLoanRecord("LOS-EXT-1");
      expect(record).toEqual(SAMPLE_LOAN);
    });

    it("returns null (not an error) for an unknown loan id", async () => {
      const connector = makeConnector([]);
      const record = await connector.pullLoanRecord("does-not-exist");
      expect(record).toBeNull();
    });

    it("accepts a status push for a known loan", async () => {
      const connector = makeConnector([SAMPLE_LOAN]);
      const result = await connector.pushStatusUpdate("LOS-EXT-1", { status: "RECORDING_SUBMITTED", vendorTrackingId: "VT-1" });
      expect(result.accepted).toBe(true);
    });

    it("rejects a status push for an unknown loan rather than throwing", async () => {
      const connector = makeConnector([]);
      const result = await connector.pushStatusUpdate("does-not-exist", { status: "RECORDING_SUBMITTED", vendorTrackingId: "VT-1" });
      expect(result.accepted).toBe(false);
    });
  });
}
