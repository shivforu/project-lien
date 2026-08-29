import { randomUUID } from "node:crypto";
import type { ERecordingNetwork } from "@project-lien/db";
import type { IErecordingProvider, PollResult, SubmissionRequest, SubmissionResult } from "./types.js";

interface MockSubmissionState {
  packageId: string;
  pollCount: number;
  estimatedFeeCents?: number;
}

export interface MockAdapterOptions {
  /** Simulates every submission for this test/run being rejected outright at submit time. */
  rejectAllSubmissions?: boolean;
  /** Added to `estimatedFeeCents` (when the caller supplied one) to produce the "actual"
   * fee reported on RECORDED — 0 (default) means the county always charges exactly the
   * estimate; a positive value simulates a fee shortage, negative simulates an overage
   * (docs/REQUIREMENTS_MATRIX.md #18, scenarios H/I). */
  feeVarianceCents?: number;
  /** If set, `pollStatus` returns REJECTED (a county rejection *after* the vendor already
   * accepted the submission) on this specific poll call number, instead of progressing
   * normally — simulates docs/TEST_STRATEGY.md scenario C. */
  rejectOnPollCount?: number;
  /** If set, `pollStatus` throws an Error on this specific poll call number instead of
   * returning — simulates a vendor outage/timeout so the real job-queue retry/backoff
   * path (docs/DECISIONS.md D3) handles it, per docs/TEST_STRATEGY.md scenario D. */
  throwOnPollCount?: number;
}

/**
 * A single deterministic mock/sandbox implementation shared (with a different `network`
 * tag) by the Simplifile/CSC/ePN adapters below — this project never fabricates
 * vendor-specific request/response shapes it hasn't seen (docs/EXTERNAL_DEPENDENCIES.md),
 * so all three behave identically except for their reported `network`.
 */
export class MockErecordingAdapter implements IErecordingProvider {
  private readonly submissions = new Map<string, MockSubmissionState>();

  constructor(
    public readonly network: ERecordingNetwork,
    private readonly options: MockAdapterOptions = {},
  ) {}

  async submit(request: SubmissionRequest): Promise<SubmissionResult> {
    if (this.options.rejectAllSubmissions) {
      return { vendorTrackingId: randomUUID(), status: "REJECTED", rejectionReason: "Simulated vendor rejection" };
    }
    const vendorTrackingId = `${this.network}-${randomUUID()}`;
    this.submissions.set(vendorTrackingId, {
      packageId: request.packageId,
      pollCount: 0,
      estimatedFeeCents: request.estimatedFeeCents,
    });
    return { vendorTrackingId, status: "SUBMITTED" };
  }

  async pollStatus(vendorTrackingId: string): Promise<PollResult> {
    const state = this.submissions.get(vendorTrackingId);
    if (!state) {
      return { vendorTrackingId, status: "REJECTED", rejectionReason: "Unknown vendor tracking id" };
    }
    state.pollCount += 1;

    if (this.options.throwOnPollCount === state.pollCount) {
      throw new Error(`Simulated vendor outage on poll #${state.pollCount}`);
    }
    if (this.options.rejectOnPollCount === state.pollCount) {
      return { vendorTrackingId, status: "REJECTED", rejectionReason: "Simulated county rejection after acceptance" };
    }

    if (state.pollCount === 1) {
      return { vendorTrackingId, status: "SUBMITTED" };
    }
    if (state.pollCount === 2) {
      return { vendorTrackingId, status: "ACCEPTED", countyTrackingId: `CTY-${vendorTrackingId.slice(-8)}` };
    }
    return {
      vendorTrackingId,
      status: "RECORDED",
      countyTrackingId: `CTY-${vendorTrackingId.slice(-8)}`,
      recordedInstrumentNumber: `INST-${vendorTrackingId.slice(-8)}`,
      actualFeeCents:
        state.estimatedFeeCents !== undefined ? state.estimatedFeeCents + (this.options.feeVarianceCents ?? 0) : undefined,
    };
  }
}

export function createSimplifileMockAdapter(options?: MockAdapterOptions): IErecordingProvider {
  return new MockErecordingAdapter("SIMPLIFILE", options);
}

export function createCscMockAdapter(options?: MockAdapterOptions): IErecordingProvider {
  return new MockErecordingAdapter("CSC", options);
}

export function createEpnMockAdapter(options?: MockAdapterOptions): IErecordingProvider {
  return new MockErecordingAdapter("EPN", options);
}
