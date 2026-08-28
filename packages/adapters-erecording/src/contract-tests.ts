import { describe, expect, it } from "vitest";
import type { IErecordingProvider } from "./types.js";

const BASE_REQUEST = {
  packageId: "pkg-1",
  priaXml: "<PriaEDocPackage/>",
  documentPdfBase64: "JVBERi0xLjQK",
  idempotencyKey: "idem-1",
};

/**
 * Shared contract test suite every `IErecordingProvider` implementation must pass
 * (docs/REQUIREMENTS_MATRIX.md #12-14). Run once per adapter via `runProviderContractTests`
 * so Simplifile/CSC/ePN can never silently drift from a common, documented behavior.
 */
export function runProviderContractTests(label: string, makeProvider: () => IErecordingProvider): void {
  describe(`IErecordingProvider contract: ${label}`, () => {
    it("reports its own network", () => {
      const provider = makeProvider();
      expect(provider.network).toBe(label);
    });

    it("submit() returns a vendor tracking id and SUBMITTED status", async () => {
      const provider = makeProvider();
      const result = await provider.submit({ ...BASE_REQUEST, network: provider.network });
      expect(result.status).toBe("SUBMITTED");
      expect(result.vendorTrackingId.length).toBeGreaterThan(0);
    });

    it("pollStatus() progresses SUBMITTED -> ACCEPTED -> RECORDED across repeated polls", async () => {
      const provider = makeProvider();
      const { vendorTrackingId } = await provider.submit({ ...BASE_REQUEST, network: provider.network });

      const first = await provider.pollStatus(vendorTrackingId);
      expect(first.status).toBe("SUBMITTED");

      const second = await provider.pollStatus(vendorTrackingId);
      expect(second.status).toBe("ACCEPTED");
      expect(second.countyTrackingId).toBeDefined();

      const third = await provider.pollStatus(vendorTrackingId);
      expect(third.status).toBe("RECORDED");
      expect(third.recordedInstrumentNumber).toBeDefined();
    });

    it("pollStatus() on an unknown tracking id reports REJECTED rather than throwing", async () => {
      const provider = makeProvider();
      const result = await provider.pollStatus("never-submitted");
      expect(result.status).toBe("REJECTED");
    });
  });
}
