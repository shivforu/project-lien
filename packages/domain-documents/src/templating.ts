import Handlebars from "handlebars";
import type { DocType } from "@project-lien/db";

/**
 * Data a document template needs. Deliberately flat and generic across doc types —
 * per docs/DECISIONS.md D4, per-state legal boilerplate differences are expressed as
 * conditional blocks inside each template, not as different data shapes.
 */
export interface DocumentTemplateData {
  docType: DocType;
  stateName: string;
  countyName: string;
  borrowerName: string;
  lenderName: string;
  propertyAddress: string;
  legalDescription: string;
  originalInstrumentNumber: string | null;
  originalBook: string | null;
  originalPage: string | null;
  loanAmountCents: number;
  trusteeName: string | null;
  witnessNames: string[];
  packageIdentifier: string;
}

const GENERIC_TEMPLATE_SOURCE = `
<!doctype html>
<html>
<head><meta charset="utf-8" /><style>
  @page { margin: 0; }
  body { font-family: "Times New Roman", serif; font-size: 12pt; margin: 0; padding: 0 0.5in; }
  .top-spacer { height: {{topMarginInches}}in; }
  h1 { font-size: 14pt; text-align: center; text-transform: uppercase; }
  .field { margin: 0.5em 0; }
  .signature-block { margin-top: 3em; }
  .recording-id { font-size: 8pt; color: #888; }
</style></head>
<body>
  <div class="top-spacer"></div>
  <h1>{{docTypeLabel}}</h1>
  <p class="recording-id">Package: {{packageIdentifier}}</p>
  <div class="field">KNOW ALL PERSONS BY THESE PRESENTS, that {{lenderName}}, holder of that certain
    {{originalInstrumentLabel}}, does hereby certify that the debt secured thereby has been
    fully paid and satisfied, and does hereby release, cancel, and discharge said instrument.</div>
  <div class="field"><strong>Borrower:</strong> {{borrowerName}}</div>
  <div class="field"><strong>Property:</strong> {{propertyAddress}}, {{countyName}} County, {{stateName}}</div>
  <div class="field"><strong>Legal Description:</strong> {{legalDescription}}</div>
  {{#if trusteeName}}<div class="field"><strong>Trustee:</strong> {{trusteeName}}</div>{{/if}}
  <div class="signature-block">
    <div class="field">{{lenderName}}</div>
    <div class="field">By: ______________________________</div>
    {{#each witnessNames}}
    <div class="field">Witness: {{this}}</div>
    {{/each}}
  </div>
</body>
</html>
`;

const DOC_TYPE_LABELS: Record<DocType, string> = {
  SATISFACTION_OF_MORTGAGE: "Satisfaction of Mortgage",
  DEED_OF_RECONVEYANCE: "Deed of Reconveyance",
  RELEASE_OF_LIEN: "Release of Lien",
  CANCELLATION_OF_SECURITY_DEED: "Cancellation of Security Deed",
  SATISFACTION_OF_SECURITY_INSTRUMENT: "Satisfaction of Security Instrument",
  CERTIFICATE_OF_SATISFACTION: "Certificate of Satisfaction",
  RELEASE_OF_DEED_OF_TRUST: "Release of Deed of Trust",
};

const compiledGenericTemplate = Handlebars.compile(GENERIC_TEMPLATE_SOURCE);

/**
 * Renders the HTML for a recording document. There is a single generic template today
 * (all 7 doc types share structure closely enough — see docs/ASSUMPTIONS.md); per-state
 * legal-text variation is future work tracked as a template-library expansion, not a
 * rendering-engine change.
 */
export function renderDocumentHtml(data: DocumentTemplateData, topMarginInches: number): string {
  const originalInstrumentLabel = data.originalInstrumentNumber
    ? `instrument recorded as Instrument No. ${data.originalInstrumentNumber}`
    : data.originalBook && data.originalPage
      ? `instrument recorded in Book ${data.originalBook}, Page ${data.originalPage}`
      : "instrument of record";

  return compiledGenericTemplate({
    ...data,
    docTypeLabel: DOC_TYPE_LABELS[data.docType],
    originalInstrumentLabel,
    topMarginInches,
  });
}
