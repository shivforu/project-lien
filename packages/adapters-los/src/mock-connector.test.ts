import { describe, expect, it } from "vitest";
import { GenericMockLosConnector } from "./mock-connector.js";
import { runLosConnectorContractTests } from "./contract-tests.js";
import type { LosLoanRecord } from "./types.js";

runLosConnectorContractTests("GenericMockLosConnector", (seedLoans) => new GenericMockLosConnector("GENERIC_MOCK_LOS", seedLoans));

describe("GenericMockLosConnector", () => {
  it("records pushed status updates in order, inspectable via getStatusHistory", async () => {
    const loan: LosLoanRecord = {
      externalLoanId: "LOS-EXT-2",
      borrowerName: "John Borrower",
      unpaidPrincipalCents: 0,
      propertyAddressLine1: "2 Main St",
      propertyStateCode: "TX",
      propertyCountyFips: "48085",
    };
    const connector = new GenericMockLosConnector("GENERIC_MOCK_LOS", [loan]);

    await connector.pushStatusUpdate("LOS-EXT-2", { status: "RECORDING_SUBMITTED", vendorTrackingId: "VT-9" });
    await connector.pushStatusUpdate("LOS-EXT-2", { status: "RECORDED", recordedAt: "2026-01-01T00:00:00Z", instrumentNumber: "INS-1" });

    const history = connector.getStatusHistory("LOS-EXT-2");
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ status: "RECORDING_SUBMITTED", vendorTrackingId: "VT-9" });
    expect(history[1]).toEqual({ status: "RECORDED", recordedAt: "2026-01-01T00:00:00Z", instrumentNumber: "INS-1" });
  });
});
