import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface PriaValidationResult {
  valid: boolean;
  errors: string[];
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

/**
 * Structural validation against THIS PROJECT'S internal PRIA-shaped contract (see
 * serializer.ts and docs/EXTERNAL_DEPENDENCIES.md) — well-formedness plus presence of
 * every element/attribute this system's own serializer always emits. This is
 * intentionally NOT validation against the real, licensed PRIA XSD (docs/DECISIONS.md),
 * so a document passing this check is only proven internally-consistent, not
 * PRIA-certified.
 */
export function validatePriaXml(xml: string): PriaValidationResult {
  const wellFormed = XMLValidator.validate(xml);
  if (wellFormed !== true) {
    return { valid: false, errors: [`XML is not well-formed: ${wellFormed.err.msg}`] };
  }

  const errors: string[] = [];
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = doc["PriaEDocPackage"] as Record<string, unknown> | undefined;

  if (!root) {
    return { valid: false, errors: ["Missing root element <PriaEDocPackage>"] };
  }
  if (!root["@_priaLevel"]) errors.push("Missing required attribute PriaEDocPackage@priaLevel");

  const requireField = (path: string, value: unknown) => {
    if (value === undefined || value === null || value === "") errors.push(`Missing required element <${path}>`);
  };

  requireField("PackageIdentifier", root["PackageIdentifier"]);
  requireField("DocumentType", root["DocumentType"]);
  requireField("PageCount", root["PageCount"]);

  const submitter = root["Submitter"] as Record<string, unknown> | undefined;
  requireField("Submitter/Name", submitter?.["Name"]);
  requireField("Submitter/ContactEmail", submitter?.["ContactEmail"]);
  const returnAddress = submitter?.["ReturnAddress"] as Record<string, unknown> | undefined;
  requireField("Submitter/ReturnAddress/Line1", returnAddress?.["Line1"]);
  requireField("Submitter/ReturnAddress/StateCode", returnAddress?.["StateCode"]);
  requireField("Submitter/ReturnAddress/Zip", returnAddress?.["Zip"]);

  const jurisdiction = root["Jurisdiction"] as Record<string, unknown> | undefined;
  requireField("Jurisdiction/StateCode", jurisdiction?.["StateCode"]);
  requireField("Jurisdiction/CountyFips", jurisdiction?.["CountyFips"]);

  const property = root["Property"] as Record<string, unknown> | undefined;
  requireField("Property/ParcelNumber", property?.["ParcelNumber"]);
  requireField("Property/LegalDescription", property?.["LegalDescription"]);

  const partiesWrapper = root["Parties"] as Record<string, unknown> | undefined;
  const partyEntries = partiesWrapper?.["Party"];
  const partyList = Array.isArray(partyEntries) ? partyEntries : partyEntries ? [partyEntries] : [];
  if (partyList.length === 0) errors.push("At least one <Parties>/<Party> is required");

  return { valid: errors.length === 0, errors };
}
