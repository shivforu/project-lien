import { describe, expect, it } from "vitest";
import * as pkg from "./index.js";

describe("@project-lien/adapters-storage", () => {
  it("is importable and exports its package marker", () => {
    expect(pkg.PACKAGE_NAME).toBe("@project-lien/adapters-storage");
  });
});
