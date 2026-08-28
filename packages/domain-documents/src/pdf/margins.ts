import { PDFDocument } from "pdf-lib";

const POINTS_PER_INCH = 72;

export interface PageMarginMeasurement {
  pageIndex: number;
  widthInches: number;
  heightInches: number;
}

export interface MarginComplianceResult {
  compliant: boolean;
  pages: PageMarginMeasurement[];
  requiredTopMarginInches: number;
  /** Present when a page's content area is too small to guarantee the required top
   * stamp zone — this is a structural check (page size), not a content-position check,
   * since detecting actual ink position on an arbitrary uploaded PDF is out of scope
   * (see docs/ASSUMPTIONS.md and D5). */
  violations: string[];
}

/**
 * Structural margin/stamp-zone check: confirms every page is a standard size that can
 * physically accommodate the county's required top margin (the recorder's stamp zone).
 * This does NOT inspect where content is actually drawn on an uploaded/scanned PDF — see
 * docs/ASSUMPTIONS.md for why (no reliable general-purpose way to do that without real
 * computer vision, which D5 explicitly does not fabricate). For documents this system
 * generates itself (via templating.ts + renderer.ts) the top margin is guaranteed correct
 * by construction (the template's `.top-spacer` element), so this check is primarily a
 * safety net for re-normalizing already-produced PDFs and for detecting egregiously
 * wrong page geometry (e.g. a legal-size page recorder rejects for exceeding 8.5x14in).
 */
export async function checkMarginCompliance(
  pdfBytes: Uint8Array,
  requiredTopMarginInches: number,
): Promise<MarginComplianceResult> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages: PageMarginMeasurement[] = [];
  const violations: string[] = [];

  doc.getPages().forEach((page, index) => {
    const { width, height } = page.getSize();
    const widthInches = width / POINTS_PER_INCH;
    const heightInches = height / POINTS_PER_INCH;
    pages.push({ pageIndex: index, widthInches, heightInches });

    if (widthInches > 8.6 || heightInches > 14.1) {
      violations.push(`Page ${index + 1} is ${widthInches.toFixed(2)}x${heightInches.toFixed(2)}in, exceeds legal-size limit`);
    }
    if (heightInches < requiredTopMarginInches + 2) {
      violations.push(
        `Page ${index + 1} height (${heightInches.toFixed(2)}in) leaves insufficient room below a ${requiredTopMarginInches}in top margin`,
      );
    }
  });

  return { compliant: violations.length === 0, pages, requiredTopMarginInches, violations };
}

/**
 * Pads a PDF's pages with additional top whitespace by embedding each existing page onto
 * a new, taller page (shifting original content down). Used to normalize a document that
 * was generated without accounting for a stricter county top-margin requirement, without
 * regenerating body text (docs/DECISIONS.md D4). `yOffsetInches` is clamped to
 * [0, 4] inches — the naming/geometry reconciliation called out in docs/DECISIONS.md D10
 * (the transcript's own code allowed unbounded/negative offsets, which could push content
 * off-page).
 */
export async function padTopMargin(pdfBytes: Uint8Array, yOffsetInches: number): Promise<Uint8Array> {
  const clamped = Math.max(0, Math.min(4, yOffsetInches));
  if (clamped === 0) return pdfBytes;

  const src = await PDFDocument.load(pdfBytes);
  const out = await PDFDocument.create();
  const offsetPoints = clamped * POINTS_PER_INCH;

  const embeddedPages = await out.embedPdf(src);
  src.getPages().forEach((srcPage, index) => {
    const { width, height } = srcPage.getSize();
    const embedded = embeddedPages[index];
    if (!embedded) throw new Error(`Failed to embed source page ${index}`);
    const newPage = out.addPage([width, height + offsetPoints]);
    newPage.drawPage(embedded, { x: 0, y: 0, width, height });
  });

  return out.save();
}
