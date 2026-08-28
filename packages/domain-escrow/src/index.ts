/**
 * Double-entry escrow ledger, fee reconciliation (overage/shortage/refund), and
 * statutory deadline/penalty monitoring. Implements docs/REQUIREMENTS_MATRIX.md items
 * #17-19, #40. All currency math is integer cents — never floating point (see
 * docs/DECISIONS.md D2 note and docs/REQUIREMENTS_MATRIX.md item #40, a real bug
 * present throughout Requirements.pdf's own code via `parseFloat`).
 * Built out in Phase 7 — see PROGRESS.md.
 */
export const PACKAGE_NAME = "@project-lien/domain-escrow";

export * from "./ledger.js";
export * from "./deadline-monitor.js";
