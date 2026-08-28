import { describe, expect, it } from "vitest";
import * as pkg from "./index.js";

// Placeholder smoke test — this package's real domain logic and its real test suite
// land in the phase named in src/index.ts's doc comment (see PROGRESS.md). This test
// only proves the package builds and is importable, so 'pnpm test' stays meaningful
// (not just green because nothing runs) while the package is a stub.
describe("@project-lien/adapters-erecording (stub)", () => {
  it("is importable and exports its package marker", () => {
    expect(pkg.PACKAGE_NAME).toBe("@project-lien/adapters-erecording");
  });
});
