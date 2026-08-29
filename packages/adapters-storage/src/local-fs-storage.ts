import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import { DocumentNotFoundError, InvalidStorageKeyError, type IDocumentStorage, type StoredDocumentRef } from "./types.js";

/**
 * A real, working `IDocumentStorage` backed by the local filesystem. This is the
 * project's actual dev/test implementation — not a mock returning canned data — files
 * really are written to and read back from `baseDir`. `docs/DECISIONS.md` D12 names
 * MinIO (S3-compatible) as the docker-compose local service and AWS S3+KMS for
 * production; this class is the filesystem-backed equivalent for environments (like this
 * build sandbox) with no MinIO/S3-compatible endpoint actually running, and shares the
 * same interface so swapping in a real S3 client (`@aws-sdk/client-s3` against MinIO's
 * S3-compatible API) later is a config/adapter change, not a rewrite of any caller.
 *
 * A content type sidecar file (`<key>.contenttype`) stores the content type passed to
 * `put`, since a plain file on disk has no such metadata otherwise.
 */
export class LocalFsDocumentStorage implements IDocumentStorage {
  constructor(private readonly baseDir: string) {}

  private resolveKeyPath(key: string): string {
    if (!key || key.trim().length === 0) throw new InvalidStorageKeyError(key);
    if (isAbsolute(key)) throw new InvalidStorageKeyError(key);
    const normalized = normalize(key);
    if (normalized.split(sep).includes("..")) throw new InvalidStorageKeyError(key);
    return join(this.baseDir, normalized);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredDocumentRef> {
    const path = this.resolveKeyPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    await writeFile(`${path}.contenttype`, contentType, "utf8");
    return { key, sizeBytes: data.byteLength, contentType };
  }

  async get(key: string): Promise<Buffer> {
    const path = this.resolveKeyPath(key);
    try {
      return await readFile(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new DocumentNotFoundError(key);
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const path = this.resolveKeyPath(key);
    try {
      await stat(path);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.resolveKeyPath(key);
    await rm(path, { force: true });
    await rm(`${path}.contenttype`, { force: true });
  }
}
