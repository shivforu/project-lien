import type { PackageStatus } from "@project-lien/db";

/**
 * The package lifecycle state machine (docs/ARCHITECTURE.md — normalized 17-state
 * lifecycle). This is the single source of truth for which transitions are legal;
 * apps/api and apps/worker must go through `assertTransition`/`canTransition` rather than
 * writing `status = ...` directly, so an illegal transition is a caught bug, not a silent
 * data-integrity issue (docs/REQUIREMENTS_MATRIX.md #20).
 */
const FORWARD_TRANSITIONS: Record<PackageStatus, PackageStatus[]> = {
  DRAFT: ["VALIDATING"],
  VALIDATING: ["PREFLIGHT_FAILED", "READY"],
  PREFLIGHT_FAILED: ["VALIDATING"],
  READY: ["PENDING_SIGNATURE"],
  PENDING_SIGNATURE: ["PENDING_NOTARY"],
  PENDING_NOTARY: ["READY_TO_SUBMIT"],
  READY_TO_SUBMIT: ["SUBMITTING"],
  SUBMITTING: ["SUBMITTED"],
  // REJECTED is reachable directly from SUBMITTED, not only from COUNTY_PROCESSING: a real
  // vendor can bounce a submission before the county ever accepts it into processing (e.g.
  // a document defect the vendor's own intake catches), so polling must be able to move a
  // package straight from SUBMITTED to REJECTED without an intermediate COUNTY_PROCESSING
  // state (docs/DECISIONS.md D17; surfaced by E2E scenario C).
  SUBMITTED: ["COUNTY_PROCESSING", "REJECTED"],
  COUNTY_PROCESSING: ["REJECTED", "RECORDED"],
  REJECTED: ["RESUBMISSION_REQUIRED"],
  RESUBMISSION_REQUIRED: ["VALIDATING"],
  RECORDED: ["RECONCILING"],
  RECONCILING: ["COMPLETE"],
  COMPLETE: [],
  FAILED: [],
  CANCELLED: [],
};

const TERMINAL_STATES: ReadonlySet<PackageStatus> = new Set(["COMPLETE", "FAILED", "CANCELLED"]);

/** CANCELLED is reachable from any non-terminal state (an operator can cancel a package
 * that hasn't finished); FAILED is reachable from any state actively doing vendor/system
 * work, where an unrecoverable error can occur (docs/ARCHITECTURE.md). */
const CANCELLABLE_FROM: PackageStatus[] = (Object.keys(FORWARD_TRANSITIONS) as PackageStatus[]).filter(
  (s) => !TERMINAL_STATES.has(s),
);
const FAILABLE_FROM: PackageStatus[] = ["SUBMITTING", "COUNTY_PROCESSING", "RECONCILING"];

export class IllegalTransitionError extends Error {
  constructor(from: PackageStatus, to: PackageStatus) {
    super(`Illegal package status transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function getAllowedTransitions(from: PackageStatus): PackageStatus[] {
  const allowed = new Set(FORWARD_TRANSITIONS[from]);
  if (CANCELLABLE_FROM.includes(from)) allowed.add("CANCELLED");
  if (FAILABLE_FROM.includes(from)) allowed.add("FAILED");
  return [...allowed];
}

export function canTransition(from: PackageStatus, to: PackageStatus): boolean {
  return getAllowedTransitions(from).includes(to);
}

export function assertTransition(from: PackageStatus, to: PackageStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

export function isTerminalState(status: PackageStatus): boolean {
  return TERMINAL_STATES.has(status);
}
