import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { checkMarginCompliance, padTopMargin } from "./margins.js";

describe("checkMarginCompliance", () => {
  it("passes a standard letter page against a normal top margin", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const result = await checkMarginCompliance(await doc.save(), 3.0);
    expect(result.compliant).toBe(true);
    expect(result.pages).toEqual([{ pageIndex: 0, widthInches: 8.5, heightInches: 11 }]);
  });

  it("flags a page exceeding legal size", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([650, 1050]); // ~9x14.6in
    const result = await checkMarginCompliance(await doc.save(), 3.0);
    expect(result.compliant).toBe(false);
    expect(result.violations[0]).toMatch(/exceeds legal-size limit/);
  });
});

// pdf-lib's page embedder requires a page to have a content stream (real generated
// documents always do — templating.ts always renders text); a truly blank page with no
// drawn content cannot be embedded, so every test page here draws something first.
async function makeContentPage(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText("content", { x: 10, y: 10 });
  return doc.save();
}

describe("padTopMargin", () => {
  it("grows page height by the clamped offset and preserves page count", async () => {
    const padded = await padTopMargin(await makeContentPage(), 1.0);
    const result = await PDFDocument.load(padded);
    expect(result.getPageCount()).toBe(1);
    expect(result.getPage(0).getSize().height).toBeCloseTo(792 + 72, 0);
  });

  it("clamps an out-of-range offset to the [0,4] inch band", async () => {
    const bytes = await makeContentPage();
    const paddedHigh = await padTopMargin(bytes, 100);
    const resultHigh = await PDFDocument.load(paddedHigh);
    expect(resultHigh.getPage(0).getSize().height).toBeCloseTo(792 + 4 * 72, 0);

    const paddedNegative = await padTopMargin(bytes, -5);
    const resultNegative = await PDFDocument.load(paddedNegative);
    expect(resultNegative.getPage(0).getSize().height).toBeCloseTo(792, 0);
  });
});
