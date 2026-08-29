import type { PreflightSeverity } from "@project-lien/db";
import { checkMarginCompliance } from "./pdf/margins.js";
import type { VisionCheckResult } from "./vision.js";

export interface PreflightFinding {
  severity: PreflightSeverity;
  code: string;
  message: string;
  pageNumber: number | null;
}

export interface PreflightResult {
  passed: boolean;
  findings: PreflightFinding[];
}

export interface PreflightInput {
  pdfBytes: Uint8Array;
  requiredTopMarginInches: number;
  trusteeRequired: boolean;
  trusteeName: string | null;
  witnessesRequired: number;
  witnessNames: string[];
  /** `null` when signature/notary-seal detection is not yet applicable at this pipeline
   * stage (e.g. the structural pre-flight run before a document has been signed —
   * docs/DECISIONS.md D17) — vision findings are skipped entirely rather than reported as
   * a false BLOCKING failure. */
  vision: VisionCheckResult | null;
  requiredFields: Record<string, string | null | undefined>;
}

/**
 * Deterministic, rule-based pre-flight checks (docs/REQUIREMENTS_MATRIX.md #7). Every
 * check here is either a structural fact about the PDF (margins/page size) or a data
 * presence/count check — nothing here does OCR or content inspection. BLOCKING findings
 * prevent a package from moving to READY; WARNING findings do not.
 */
export async function runPreflight(input: PreflightInput): Promise<PreflightResult> {
  const findings: PreflightFinding[] = [];

  for (const [field, value] of Object.entries(input.requiredFields)) {
    if (value === null || value === undefined || value.trim() === "") {
      findings.push({
        severity: "BLOCKING",
        code: "MISSING_REQUIRED_FIELD",
        message: `Required field '${field}' is missing`,
        pageNumber: null,
      });
    }
  }

  const margins = await checkMarginCompliance(input.pdfBytes, input.requiredTopMarginInches);
  for (const violation of margins.violations) {
    findings.push({ severity: "BLOCKING", code: "MARGIN_VIOLATION", message: violation, pageNumber: null });
  }

  if (input.trusteeRequired && (!input.trusteeName || input.trusteeName.trim() === "")) {
    findings.push({
      severity: "BLOCKING",
      code: "TRUSTEE_MISSING",
      message: "This jurisdiction requires a named trustee, but none is set",
      pageNumber: null,
    });
  }

  if (input.witnessNames.length < input.witnessesRequired) {
    findings.push({
      severity: "BLOCKING",
      code: "WITNESS_COUNT_INSUFFICIENT",
      message: `This jurisdiction requires ${input.witnessesRequired} witness(es), found ${input.witnessNames.length}`,
      pageNumber: null,
    });
  }

  if (input.vision) {
    if (!input.vision.signatureDetected) {
      findings.push({
        severity: "BLOCKING",
        code: "SIGNATURE_NOT_DETECTED",
        message: "No signature detected on the document",
        pageNumber: null,
      });
    }
    if (!input.vision.notarySealDetected) {
      findings.push({
        severity: "BLOCKING",
        code: "NOTARY_SEAL_NOT_DETECTED",
        message: "No notary seal detected on the document",
        pageNumber: null,
      });
    }
    if (input.vision.isMock) {
      findings.push({
        severity: "WARNING",
        code: "VISION_CHECK_IS_MOCK",
        message: "Signature/seal detection used a mock provider — see docs/EXTERNAL_DEPENDENCIES.md",
        pageNumber: null,
      });
    }
  }

  const passed = findings.every((f) => f.severity !== "BLOCKING");
  return { passed, findings };
}
