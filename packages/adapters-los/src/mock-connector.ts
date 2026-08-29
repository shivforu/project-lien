import type { ILosConnector, LosLoanRecord, LosStatusUpdate, PushStatusResult } from "./types.js";

/**
 * A real, working in-memory `ILosConnector` demonstrating the generic mapping shape any
 * real vendor connector would implement — not a fabricated vendor API, an explicitly
 * generic mock (same posture as the eRecording mock adapters,
 * `packages/adapters-erecording/src/mock-adapter.ts`).
 */
export class GenericMockLosConnector implements ILosConnector {
  readonly vendorName: string;
  private readonly loans = new Map<string, LosLoanRecord>();
  private readonly statusHistory = new Map<string, LosStatusUpdate[]>();

  constructor(vendorName = "GENERIC_MOCK_LOS", seedLoans: LosLoanRecord[] = []) {
    this.vendorName = vendorName;
    for (const loan of seedLoans) this.loans.set(loan.externalLoanId, loan);
  }

  async pullLoanRecord(externalLoanId: string): Promise<LosLoanRecord | null> {
    return this.loans.get(externalLoanId) ?? null;
  }

  async pushStatusUpdate(externalLoanId: string, update: LosStatusUpdate): Promise<PushStatusResult> {
    if (!this.loans.has(externalLoanId)) {
      return { accepted: false, externalLoanId };
    }
    const history = this.statusHistory.get(externalLoanId) ?? [];
    history.push(update);
    this.statusHistory.set(externalLoanId, history);
    return { accepted: true, externalLoanId };
  }

  /** Test/inspection helper — not part of the `ILosConnector` interface. */
  getStatusHistory(externalLoanId: string): LosStatusUpdate[] {
    return this.statusHistory.get(externalLoanId) ?? [];
  }
}
