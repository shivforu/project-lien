/**
 * IErecordingProvider interface + Simplifile/CSC/ePN mock adapters + router.
 * Implements docs/REQUIREMENTS_MATRIX.md items #11-16.
 * See docs/DECISIONS.md D6 and docs/EXTERNAL_DEPENDENCIES.md — every vendor adapter here
 * is a sandbox mock; none of Requirements.pdf's invented endpoint shapes are treated as
 * real vendor specs.
 * Built out in Phase 5 — see PROGRESS.md.
 */
export const PACKAGE_NAME = "@project-lien/adapters-erecording";

export * from "./types.js";
export * from "./mock-adapter.js";
export * from "./router.js";
