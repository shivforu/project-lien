import type { ERecordingNetwork } from "@project-lien/db";
import type { IErecordingProvider } from "./types.js";
import { UnsupportedNetworkError } from "./types.js";
import { createCscMockAdapter, createEpnMockAdapter, createSimplifileMockAdapter } from "./mock-adapter.js";

/**
 * Routes a county's configured network (`county_jurisdiction_rules.e_recording_network`)
 * to a provider adapter (docs/REQUIREMENTS_MATRIX.md #15). `DIRECT_COUNTY` and `MANUAL`
 * have no adapter — direct-to-county integration is explicitly deferred
 * (docs/REQUIREMENTS_MATRIX.md #16) and `MANUAL` means "outside this system" by
 * definition, so routing either raises `UnsupportedNetworkError` for the caller (worker)
 * to route into a human exception queue instead.
 */
export class ErecordingProviderRouter {
  private readonly providers = new Map<ERecordingNetwork, IErecordingProvider>([
    ["SIMPLIFILE", createSimplifileMockAdapter()],
    ["CSC", createCscMockAdapter()],
    ["EPN", createEpnMockAdapter()],
  ]);

  resolve(network: ERecordingNetwork): IErecordingProvider {
    const provider = this.providers.get(network);
    if (!provider) throw new UnsupportedNetworkError(network);
    return provider;
  }

  /** Test/ops seam — swap in a custom adapter instance (e.g. one configured to reject). */
  register(network: ERecordingNetwork, provider: IErecordingProvider): void {
    this.providers.set(network, provider);
  }
}
