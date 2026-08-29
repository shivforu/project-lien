import { describe, expect, it } from "vitest";
import { DocumentNotFoundError } from "./types.js";
import type { IDocumentStorage } from "./types.js";

/**
 * Shared contract suite any `IDocumentStorage` implementation must pass — mirrors the
 * pattern established for eRecording adapters in
 * `packages/adapters-erecording/src/contract-tests.ts`.
 */
export function runDocumentStorageContractTests(label: string, makeStorage: () => IDocumentStorage): void {
  describe(`IDocumentStorage contract: ${label}`, () => {
    it("round-trips a put document through get", async () => {
      const storage = makeStorage();
      const data = Buffer.from("hello document storage");
      await storage.put("docs/a.pdf", data, "application/pdf");
      const read = await storage.get("docs/a.pdf");
      expect(read.equals(data)).toBe(true);
    });

    it("reports exists() correctly before and after put", async () => {
      const storage = makeStorage();
      expect(await storage.exists("docs/b.pdf")).toBe(false);
      await storage.put("docs/b.pdf", Buffer.from("x"), "application/pdf");
      expect(await storage.exists("docs/b.pdf")).toBe(true);
    });

    it("throws DocumentNotFoundError for a missing key", async () => {
      const storage = makeStorage();
      await expect(storage.get("docs/does-not-exist.pdf")).rejects.toBeInstanceOf(DocumentNotFoundError);
    });

    it("overwrites on a second put to the same key", async () => {
      const storage = makeStorage();
      await storage.put("docs/c.pdf", Buffer.from("v1"), "application/pdf");
      await storage.put("docs/c.pdf", Buffer.from("v2"), "application/pdf");
      const read = await storage.get("docs/c.pdf");
      expect(read.toString("utf8")).toBe("v2");
    });

    it("delete removes the object, and deleting a missing key is a no-op", async () => {
      const storage = makeStorage();
      await storage.put("docs/d.pdf", Buffer.from("x"), "application/pdf");
      await storage.delete("docs/d.pdf");
      expect(await storage.exists("docs/d.pdf")).toBe(false);
      await expect(storage.delete("docs/d.pdf")).resolves.toBeUndefined();
    });

    it("rejects a key that attempts path traversal", async () => {
      const storage = makeStorage();
      await expect(storage.put("../escape.pdf", Buffer.from("x"), "application/pdf")).rejects.toThrow();
    });
  });
}
