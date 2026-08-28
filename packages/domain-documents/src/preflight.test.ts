import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { runPreflight } from "./preflight.js";
import { MockSignatureVisionProvider } from "./vision.js";

async function makeStandardLetterPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]); // 8.5x11in in points
  return doc.save();
}

const vision = new MockSignatureVisionProvider();

describe("runPreflight", () => {
  it("passes a well-formed package", async () => {
    const result = await runPreflight({
      pdfBytes: await makeStandardLetterPdf(),
      requiredTopMarginInches: 3.0,
      trusteeRequired: false,
      trusteeName: null,
      witnessesRequired: 0,
      witnessNames: [],
      vision: await vision.check({ claimedSignaturePresent: true, claimedNotarySealPresent: true }),
      requiredFields: { borrowerName: "Jane Borrower", lenderName: "Acme Mortgage" },
    });
    expect(result.passed).toBe(true);
    // The mock-provider disclosure is a WARNING and does not block.
    expect(result.findings.some((f) => f.code === "VISION_CHECK_IS_MOCK")).toBe(true);
  });

  it("blocks on missing required fields", async () => {
    const result = await runPreflight({
      pdfBytes: await makeStandardLetterPdf(),
      requiredTopMarginInches: 3.0,
      trusteeRequired: false,
      trusteeName: null,
      witnessesRequired: 0,
      witnessNames: [],
      vision: await vision.check({ claimedSignaturePresent: true, claimedNotarySealPresent: true }),
      requiredFields: { borrowerName: "" },
    });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === "MISSING_REQUIRED_FIELD")).toBe(true);
  });

  it("blocks when a required trustee is missing", async () => {
    const result = await runPreflight({
      pdfBytes: await makeStandardLetterPdf(),
      requiredTopMarginInches: 3.0,
      trusteeRequired: true,
      trusteeName: null,
      witnessesRequired: 0,
      witnessNames: [],
      vision: await vision.check({ claimedSignaturePresent: true, claimedNotarySealPresent: true }),
      requiredFields: {},
    });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === "TRUSTEE_MISSING")).toBe(true);
  });

  it("blocks when witness count is insufficient", async () => {
    const result = await runPreflight({
      pdfBytes: await makeStandardLetterPdf(),
      requiredTopMarginInches: 3.0,
      trusteeRequired: false,
      trusteeName: null,
      witnessesRequired: 2,
      witnessNames: ["Only One"],
      vision: await vision.check({ claimedSignaturePresent: true, claimedNotarySealPresent: true }),
      requiredFields: {},
    });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === "WITNESS_COUNT_INSUFFICIENT")).toBe(true);
  });

  it("blocks when signature or notary seal is not detected", async () => {
    const result = await runPreflight({
      pdfBytes: await makeStandardLetterPdf(),
      requiredTopMarginInches: 3.0,
      trusteeRequired: false,
      trusteeName: null,
      witnessesRequired: 0,
      witnessNames: [],
      vision: await vision.check({ claimedSignaturePresent: false, claimedNotarySealPresent: false }),
      requiredFields: {},
    });
    expect(result.passed).toBe(false);
    expect(result.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["SIGNATURE_NOT_DETECTED", "NOTARY_SEAL_NOT_DETECTED"]),
    );
  });

  it("blocks on a page too small for the required top margin", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]); // tiny page, well under 3in + 2in margin floor
    const result = await runPreflight({
      pdfBytes: await doc.save(),
      requiredTopMarginInches: 3.0,
      trusteeRequired: false,
      trusteeName: null,
      witnessesRequired: 0,
      witnessNames: [],
      vision: await vision.check({ claimedSignaturePresent: true, claimedNotarySealPresent: true }),
      requiredFields: {},
    });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === "MARGIN_VIOLATION")).toBe(true);
  });
});
