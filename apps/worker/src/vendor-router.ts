import { ErecordingProviderRouter } from "@project-lien/adapters-erecording";

/**
 * Single process-lifetime router instance shared by every job handler that talks to an
 * eRecording vendor, and imported directly by tests that need to seed mock-adapter state
 * (e.g. call `.submit()` before a test polls). A real vendor tracks submission state on
 * its own servers, keyed by the tracking id it issued; these mock adapters stand in for
 * that with in-process memory, which means (documented as a known limitation) a worker
 * restart loses in-flight mock submission state — a real vendor integration would not
 * have this limitation, since the state lives on the vendor's side, not the worker's.
 */
export const erecordingRouter = new ErecordingProviderRouter();
