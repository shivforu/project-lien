import { defineConfig } from "vitest/config";

// This package currently exports type-only declarations with no runtime behavior to
// test — real DTOs land in Phase 8 (docs/API.md) and will get real tests then.
export default defineConfig({
  test: {
    passWithNoTests: true,
  },
});
