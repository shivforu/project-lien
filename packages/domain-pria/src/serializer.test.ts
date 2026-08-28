import { describe, expect, it } from "vitest";
import { serializePriaPackageToXml } from "./serializer.js";
import { validatePriaXml } from "./validator.js";
import type { PriaPackage } from "./types.js";

const PKG: PriaPackage = {
  packageIdentifier: "PKG-0001",
  priaLevel: "LEVEL_2",
  documentType: "DEED_OF_RECONVEYANCE",
  submitter: {
    name: "Demo Title & Escrow Co.",
    contactEmail: "ops@demo-title.example",
    returnAddressLine1: "1 Escrow Way",
    returnCity: "Los Angeles",
    returnStateCode: "CA",
    returnZip: "90001",
  },
  jurisdiction: { stateCode: "CA", countyFips: "06037", countyName: "Los Angeles" },
  property: {
    parcelNumber: "1234-567-890",
    addressLine1: "123 Main St",
    city: "Los Angeles",
    zip: "90001",
    legalDescription: "Lot 4, Block 2, Tract 12345",
  },
  reference: { originalInstrumentNumber: "2020-123456", originalBook: null, originalPage: null },
  parties: [
    { role: "GRANTOR", isOrganization: true, name: "Acme Mortgage LLC" },
    { role: "GRANTEE", isOrganization: false, name: "Jane Borrower" },
  ],
  pageCount: 2,
};

describe("serializePriaPackageToXml + validatePriaXml", () => {
  it("round-trips a well-formed, structurally valid document", () => {
    const xml = serializePriaPackageToXml(PKG);
    expect(xml).toContain("<PriaEDocPackage");
    expect(xml).toContain("PKG-0001");
    const result = validatePriaXml(xml);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects malformed XML", () => {
    const result = validatePriaXml("<PriaEDocPackage><Unclosed></PriaEDocPackage>");
    expect(result.valid).toBe(false);
  });

  it("rejects a document missing required elements", () => {
    const xml = serializePriaPackageToXml({ ...PKG, parties: [] });
    const result = validatePriaXml(xml);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("At least one <Parties>/<Party> is required");
  });

  it("flags a missing submitter email", () => {
    const xml = serializePriaPackageToXml({
      ...PKG,
      submitter: { ...PKG.submitter, contactEmail: "" },
    });
    const result = validatePriaXml(xml);
    expect(result.errors).toContain("Missing required element <Submitter/ContactEmail>");
  });
});
