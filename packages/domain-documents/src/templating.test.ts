import { describe, expect, it } from "vitest";
import { renderDocumentHtml, type DocumentTemplateData } from "./templating.js";

const DATA: DocumentTemplateData = {
  docType: "DEED_OF_RECONVEYANCE",
  stateName: "California",
  countyName: "Los Angeles",
  borrowerName: "Jane Borrower",
  lenderName: "Acme Mortgage LLC",
  propertyAddress: "123 Main St",
  legalDescription: "Lot 4, Block 2, Tract 12345",
  originalInstrumentNumber: "2020-123456",
  originalBook: null,
  originalPage: null,
  loanAmountCents: 30000000,
  trusteeName: "First American Title",
  witnessNames: [],
  packageIdentifier: "PKG-0001",
};

describe("renderDocumentHtml", () => {
  it("renders the doc type label and key fields", () => {
    const html = renderDocumentHtml(DATA, 3.0);
    // The doc-type label is title-cased in markup; CSS (text-transform: uppercase)
    // renders it uppercase visually only, so this asserts what's actually in the HTML.
    expect(html).toContain("<h1>Deed of Reconveyance</h1>");
    expect(html).toContain("Jane Borrower");
    expect(html).toContain("Acme Mortgage LLC");
    expect(html).toContain("123 Main St");
    expect(html).toContain("First American Title");
    expect(html).toContain("Instrument No. 2020-123456");
  });

  it("applies the top margin as inline spacer height", () => {
    const html = renderDocumentHtml(DATA, 2.5);
    expect(html).toContain("height: 2.5in");
  });

  it("falls back to book/page when no instrument number is present", () => {
    const html = renderDocumentHtml({ ...DATA, originalInstrumentNumber: null, originalBook: "100", originalPage: "50" }, 3.0);
    expect(html).toContain("Book 100, Page 50");
  });

  it("omits trustee block when trusteeName is null", () => {
    const html = renderDocumentHtml({ ...DATA, trusteeName: null }, 3.0);
    expect(html).not.toContain("<strong>Trustee:</strong>");
  });
});
