/**
 * Signature/notary-seal detection seam. Requirements.pdf's own implementation
 * (`VisionValidator.ts`, Module 2 pp.44-46) is not real computer vision — it estimates
 * dark-pixel density in the lower third of a rendered page as a signature/seal proxy.
 * Presenting that as a working CV check would violate this project's "never fabricate"
 * rule (docs/DECISIONS.md D5), so instead this defines the real interface a production
 * CV/OCR vendor (or a human review queue) would implement, and ships only a deterministic
 * pass-through mock that reports exactly what it's told — it detects nothing on its own.
 */
export interface VisionCheckInput {
  /** Set by an upstream step (e-signature completion, human review) — this mock does not
   * independently verify it. */
  claimedSignaturePresent: boolean;
  claimedNotarySealPresent: boolean;
}

export interface VisionCheckResult {
  signatureDetected: boolean;
  notarySealDetected: boolean;
  /** Always true for the mock — a real provider would report its own confidence/model version here. */
  isMock: true;
}

export interface ISignatureVisionProvider {
  check(input: VisionCheckInput): Promise<VisionCheckResult>;
}

export class MockSignatureVisionProvider implements ISignatureVisionProvider {
  async check(input: VisionCheckInput): Promise<VisionCheckResult> {
    return {
      signatureDetected: input.claimedSignaturePresent,
      notarySealDetected: input.claimedNotarySealPresent,
      isMock: true,
    };
  }
}
