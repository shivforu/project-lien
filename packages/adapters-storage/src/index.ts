/**
 * IDocumentStorage abstraction — MinIO locally, AWS S3+KMS in production (config swap
 * only, see docs/DECISIONS.md D12 and docs/DEPLOYMENT.md). `LocalFsDocumentStorage` is
 * the real, filesystem-backed implementation used for local dev/test in this build,
 * where no MinIO/S3-compatible endpoint is actually running.
 * Implements docs/REQUIREMENTS_MATRIX.md item #35.
 * Built out in Phase 11 — see PROGRESS.md.
 */
export const PACKAGE_NAME = "@project-lien/adapters-storage";

export * from "./types.js";
export * from "./local-fs-storage.js";
