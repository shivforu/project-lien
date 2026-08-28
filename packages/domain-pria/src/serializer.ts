import { create } from "xmlbuilder2";
import type { PriaPackage } from "./types.js";

/**
 * Serializes a PriaPackage into this project's PRIA-shaped XML dialect
 * (docs/DECISIONS.md — PRIA is treated as "Level 2" structural conformance only; see
 * docs/EXTERNAL_DEPENDENCIES.md for why the real PRIA XSD is not used/validated against).
 */
export function serializePriaPackageToXml(pkg: PriaPackage): string {
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("PriaEDocPackage", {
    xmlns: "urn:project-lien:pria-shaped:v1",
    priaLevel: pkg.priaLevel,
  });

  root.ele("PackageIdentifier").txt(pkg.packageIdentifier);
  root.ele("DocumentType").txt(pkg.documentType);

  const submitter = root.ele("Submitter");
  submitter.ele("Name").txt(pkg.submitter.name);
  submitter.ele("ContactEmail").txt(pkg.submitter.contactEmail);
  const returnAddr = submitter.ele("ReturnAddress");
  returnAddr.ele("Line1").txt(pkg.submitter.returnAddressLine1);
  returnAddr.ele("City").txt(pkg.submitter.returnCity);
  returnAddr.ele("StateCode").txt(pkg.submitter.returnStateCode);
  returnAddr.ele("Zip").txt(pkg.submitter.returnZip);

  const jurisdiction = root.ele("Jurisdiction");
  jurisdiction.ele("StateCode").txt(pkg.jurisdiction.stateCode);
  jurisdiction.ele("CountyFips").txt(pkg.jurisdiction.countyFips);
  jurisdiction.ele("CountyName").txt(pkg.jurisdiction.countyName);

  const property = root.ele("Property");
  property.ele("ParcelNumber").txt(pkg.property.parcelNumber);
  property.ele("AddressLine1").txt(pkg.property.addressLine1);
  property.ele("City").txt(pkg.property.city);
  property.ele("Zip").txt(pkg.property.zip);
  property.ele("LegalDescription").txt(pkg.property.legalDescription);

  const reference = root.ele("ReferenceInstrument");
  if (pkg.reference.originalInstrumentNumber) {
    reference.ele("InstrumentNumber").txt(pkg.reference.originalInstrumentNumber);
  }
  if (pkg.reference.originalBook && pkg.reference.originalPage) {
    reference.ele("Book").txt(pkg.reference.originalBook);
    reference.ele("Page").txt(pkg.reference.originalPage);
  }

  const parties = root.ele("Parties");
  for (const party of pkg.parties) {
    parties
      .ele("Party", { role: party.role, isOrganization: String(party.isOrganization) })
      .ele("Name")
      .txt(party.name);
  }

  root.ele("PageCount").txt(String(pkg.pageCount));

  return root.end({ prettyPrint: true });
}
