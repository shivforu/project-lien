import type { ERecordingNetwork } from "@project-lien/db";

export interface SubmissionRequest {
  packageId: string;
  network: ERecordingNetwork;
  priaXml: string;
  documentPdfBase64: string;
  idempotencyKey: string;
  /** The submitter's own estimated recording fee (integer cents), carried through so a
   * mock/sandbox adapter can report a deterministic "actual" fee on RECORDED for
   * fee-reconciliation testing (docs/REQUIREMENTS_MATRIX.md #18, scenarios H/I). Optional
   * because a real vendor wouldn't need this echoed back to it. */
  estimatedFeeCents?: number;
}

export interface SubmissionResult {
  vendorTrackingId: string;
  status: "SUBMITTED" | "REJECTED";
  rejectionReason?: string;
}

export interface PollResult {
  vendorTrackingId: string;
  status: "SUBMITTED" | "ACCEPTED" | "REJECTED" | "RECORDED";
  countyTrackingId?: string;
  recordedBook?: string;
  recordedPage?: string;
  recordedInstrumentNumber?: string;
  rejectionReason?: string;
  /** The county's actual charged recording fee, in integer cents — only ever present when
   * `status === "RECORDED"` and the request that started this submission carried
   * `estimatedFeeCents`. */
  actualFeeCents?: number;
}

/**
 * Vendor-neutral eRecording provider contract (docs/REQUIREMENTS_MATRIX.md #11). Real
 * vendor implementations (Simplifile, CSC, ePN) require licensed API access this project
 * does not have — see docs/EXTERNAL_DEPENDENCIES.md — so every implementation shipped
 * here is a deterministic mock/sandbox, proven only by the contract tests in
 * contract-tests.ts, never against a real vendor endpoint.
 */
export interface IErecordingProvider {
  readonly network: ERecordingNetwork;
  submit(request: SubmissionRequest): Promise<SubmissionResult>;
  pollStatus(vendorTrackingId: string): Promise<PollResult>;
}

export class UnsupportedNetworkError extends Error {
  constructor(network: string) {
    super(`No eRecording provider adapter is registered for network '${network}'`);
    this.name = "UnsupportedNetworkError";
  }
}
