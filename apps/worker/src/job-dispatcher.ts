import type { JobHandler } from "./handlers/types.js";
import { pollVendorSubmissionHandler } from "./handlers/poll-vendor-submission.js";
import { statutoryDeadlineScanHandler } from "./handlers/statutory-deadline-scan.js";

/**
 * Job-type -> handler registry. Later phases register additional handlers here
 * (Phase 8 adds webhook delivery) without changing the claim/retry loop in index.ts.
 */
export const JOB_HANDLERS: Record<string, JobHandler> = {
  POLL_VENDOR_SUBMISSION: pollVendorSubmissionHandler,
  STATUTORY_DEADLINE_SCAN: statutoryDeadlineScanHandler,
};
