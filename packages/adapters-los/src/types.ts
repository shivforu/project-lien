/**
 * Generic LOS/TMS (loan origination / title management system) connector interface
 * (docs/REQUIREMENTS_MATRIX.md #34). Requirements.pdf names specific vendors (Encompass,
 * Qualia, SoftPro, RamQuest) but supplies no real API specs or credentials for any of
 * them — see docs/EXTERNAL_DEPENDENCIES.md — so this models the *shape* every such
 * integration needs (push a payoff/lien-release status update out, pull a loan record
 * in) behind one connector-agnostic interface, rather than fabricating a vendor-specific
 * API surface.
 */
export interface LosLoanRecord {
  externalLoanId: string;
  borrowerName: string;
  unpaidPrincipalCents: number;
  propertyAddressLine1: string;
  propertyStateCode: string;
  propertyCountyFips: string;
}

export type LosStatusUpdate =
  | { status: "RECORDING_SUBMITTED"; vendorTrackingId: string }
  | { status: "RECORDED"; recordedAt: string; instrumentNumber: string }
  | { status: "REJECTED"; reason: string };

export interface PushStatusResult {
  accepted: boolean;
  externalLoanId: string;
}

export class LosConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LosConnectorError";
  }
}

export interface ILosConnector {
  readonly vendorName: string;
  /** Pulls the current loan record from the LOS/TMS by its external loan id. Returns
   * `null` if the vendor has no record for that id (not an error condition). */
  pullLoanRecord(externalLoanId: string): Promise<LosLoanRecord | null>;
  /** Pushes a lien-release status update back into the LOS/TMS so it reflects in the
   * originator's own system of record. */
  pushStatusUpdate(externalLoanId: string, update: LosStatusUpdate): Promise<PushStatusResult>;
}
