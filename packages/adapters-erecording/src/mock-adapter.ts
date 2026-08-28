import { randomUUID } from "node:crypto";
import type { ERecordingNetwork } from "@project-lien/db";
import type { IErecordingProvider, PollResult, SubmissionRequest, SubmissionResult } from "./types.js";

interface MockSubmissionState {
  packageId: string;
  pollCount: number;
  /** Configurable via `MockErecordingAdapter`'s constructor — lets contract/unit tests
   * force acceptance, rejection, or a multi-poll acceptance delay deterministically. */
  outcome: "ACCEPT_AFTER_ONE_POLL" | "REJECT" | "ACCEPT_IMMEDIATELY";
}

export interface MockAdapterOptions {
  /** Simulates every submission for this test/run being rejected outright at submit time. */
  rejectAllSubmissions?: boolean;
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
      outcome: "ACCEPT_AFTER_ONE_POLL",
    });
    return { vendorTrackingId, status: "SUBMITTED" };
  }

  async pollStatus(vendorTrackingId: string): Promise<PollResult> {
    const state = this.submissions.get(vendorTrackingId);
    if (!state) {
      return { vendorTrackingId, status: "REJECTED", rejectionReason: "Unknown vendor tracking id" };
    }
    state.pollCount += 1;

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
