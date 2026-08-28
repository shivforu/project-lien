import { describe, expect, it } from "vitest";
import { createCscMockAdapter, createEpnMockAdapter, createSimplifileMockAdapter, MockErecordingAdapter } from "./mock-adapter.js";
import { runProviderContractTests } from "./contract-tests.js";
import { ErecordingProviderRouter } from "./router.js";
import { UnsupportedNetworkError } from "./types.js";

runProviderContractTests("SIMPLIFILE", createSimplifileMockAdapter);
runProviderContractTests("CSC", createCscMockAdapter);
runProviderContractTests("EPN", createEpnMockAdapter);

describe("MockErecordingAdapter rejection mode", () => {
  it("rejects at submit time when configured to", async () => {
    const adapter = new MockErecordingAdapter("SIMPLIFILE", { rejectAllSubmissions: true });
    const result = await adapter.submit({
      packageId: "pkg-1",
      network: "SIMPLIFILE",
      priaXml: "<x/>",
      documentPdfBase64: "x",
      idempotencyKey: "idem-1",
    });
    expect(result.status).toBe("REJECTED");
    expect(result.rejectionReason).toBeDefined();
  });
});

describe("ErecordingProviderRouter", () => {
  it("resolves each supported network to a matching adapter", () => {
    const router = new ErecordingProviderRouter();
    expect(router.resolve("SIMPLIFILE").network).toBe("SIMPLIFILE");
    expect(router.resolve("CSC").network).toBe("CSC");
    expect(router.resolve("EPN").network).toBe("EPN");
  });

  it("throws UnsupportedNetworkError for MANUAL and DIRECT_COUNTY (deferred, matrix #16)", () => {
    const router = new ErecordingProviderRouter();
    expect(() => router.resolve("MANUAL")).toThrow(UnsupportedNetworkError);
    expect(() => router.resolve("DIRECT_COUNTY")).toThrow(UnsupportedNetworkError);
  });

  it("allows swapping in a custom adapter instance for testing", async () => {
    const router = new ErecordingProviderRouter();
    router.register("SIMPLIFILE", new MockErecordingAdapter("SIMPLIFILE", { rejectAllSubmissions: true }));
    const result = await router.resolve("SIMPLIFILE").submit({
      packageId: "pkg-1",
      network: "SIMPLIFILE",
      priaXml: "<x/>",
      documentPdfBase64: "x",
      idempotencyKey: "idem-1",
    });
    expect(result.status).toBe("REJECTED");
  });
});
