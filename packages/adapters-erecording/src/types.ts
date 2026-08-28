import type { ERecordingNetwork } from "@project-lien/db";

export interface SubmissionRequest {
  packageId: string;
  network: ERecordingNetwork;
  priaXml: string;
  documentPdfBase64: string;
  idempotencyKey: string;
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
