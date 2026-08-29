/**
 * Document storage abstraction (docs/REQUIREMENTS_MATRIX.md #35, docs/DECISIONS.md D12).
 * Any implementation — local filesystem for dev/test, or a real MinIO/S3 client in
 * production — must satisfy this interface and pass `runDocumentStorageContractTests`.
 */
export interface StoredDocumentRef {
  key: string;
  sizeBytes: number;
  contentType: string;
}

export class DocumentNotFoundError extends Error {
  constructor(key: string) {
    super(`No stored document for key '${key}'`);
    this.name = "DocumentNotFoundError";
  }
}

export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key '${key}' — keys must be relative, non-empty, and may not contain '..' path segments`);
    this.name = "InvalidStorageKeyError";
  }
}

export interface IDocumentStorage {
  /** Writes `data` under `key`, overwriting any existing object at that key. */
  put(key: string, data: Buffer, contentType: string): Promise<StoredDocumentRef>;
  /** Reads the full object at `key`. Throws `DocumentNotFoundError` if it doesn't exist. */
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** Deletes the object at `key`. A delete of a non-existent key is a no-op, not an error
   * (matches S3/MinIO delete semantics). */
  delete(key: string): Promise<void>;
}
