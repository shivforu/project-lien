import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderHtmlToPdf } from "./renderer.js";

// This is the one real-browser integration test in the package (docs/TEST_STRATEGY.md) —
// everything else in domain-documents is a pure-function unit test. It proves the
// Playwright pivot documented in docs/DECISIONS.md D4 actually works in this environment,
// not just that the code compiles.
describe("renderHtmlToPdf", () => {
  it("renders simple HTML into a valid single-page PDF", async () => {
    const pdfBytes = await renderHtmlToPdf("<html><body><h1>Hello Project Lien</h1></body></html>");
    expect(pdfBytes.byteLength).toBeGreaterThan(100);
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width / 72).toBeCloseTo(8.5, 1);
    expect(height / 72).toBeCloseTo(11, 1);
  }, 30000);
});
