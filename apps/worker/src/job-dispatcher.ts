import type { JobHandler } from "./handlers/types.js";
import { pollVendorSubmissionHandler } from "./handlers/poll-vendor-submission.js";
import { statutoryDeadlineScanHandler } from "./handlers/statutory-deadline-scan.js";
import { webhookDeliveryHandler } from "./handlers/webhook-delivery.js";

/** Job-type -> handler registry. */
export const JOB_HANDLERS: Record<string, JobHandler> = {
  POLL_VENDOR_SUBMISSION: pollVendorSubmissionHandler,
  STATUTORY_DEADLINE_SCAN: statutoryDeadlineScanHandler,
  WEBHOOK_DELIVERY: webhookDeliveryHandler,
};
