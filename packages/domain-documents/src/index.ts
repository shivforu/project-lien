/**
 * Statutory document generation (Handlebars + Puppeteer), PDF margin/stamp-zone
 * normalization (pdf-lib), and deterministic + vision-provider pre-flight validation.
 * Implements docs/REQUIREMENTS_MATRIX.md items #5-8. See docs/DECISIONS.md D4/D5 for why
 * this does NOT reuse Requirements.pdf's programmatic drawText generator or its toy
 * pixel-density "computer vision" heuristics.
 * Built out in Phase 3 — see PROGRESS.md.
 */
export const PACKAGE_NAME = "@project-lien/domain-documents";
