/**
 * IDocumentStorage abstraction — MinIO locally, AWS S3+KMS in production (config swap
 * only, see docs/DECISIONS.md D12 and docs/DEPLOYMENT.md).
 * Implements docs/REQUIREMENTS_MATRIX.md item #35.
 * Built out starting Phase 3 (documents need somewhere to live) — see PROGRESS.md.
 */
export const PACKAGE_NAME = "@project-lien/adapters-storage";
