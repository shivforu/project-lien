/**
 * Generic inbound LOS/TMS connector interface + one mock connector demonstrating the
 * mapping shape. Named vendors (Encompass, Qualia, SoftPro, RamQuest) have no available
 * specs/credentials — see docs/EXTERNAL_DEPENDENCIES.md — so none are fabricated here.
 * Implements docs/REQUIREMENTS_MATRIX.md item #34.
 * Built out in Phase 11 — see PROGRESS.md.
 */
export const PACKAGE_NAME = "@project-lien/adapters-los";

export * from "./types.js";
export * from "./mock-connector.js";
