import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { LocalFsDocumentStorage } from "./local-fs-storage.js";
import { runDocumentStorageContractTests } from "./contract-tests.js";

// A fresh temp directory per test — LocalFsDocumentStorage does real disk I/O, so this
// verifies actual file read/write/delete behavior, not a mock.
let currentDir: string;

beforeEach(async () => {
  currentDir = await mkdtemp(join(tmpdir(), "project-lien-storage-test-"));
});

afterEach(async () => {
  await rm(currentDir, { recursive: true, force: true });
});

runDocumentStorageContractTests("LocalFsDocumentStorage", () => new LocalFsDocumentStorage(currentDir));
