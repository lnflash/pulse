/**
 * StoragePort — hexagonal boundary for file/blob storage adapters.
 * Adapters for filesystem, S3, GCS, Azure Blob, etc. implement this interface.
 */

/** Metadata associated with a stored file. */
export interface StorageMetadata {
  /** MIME type of the file */
  contentType?: string;
  /** Size in bytes */
  size: number;
  /** When the file was created/uploaded */
  createdAt: Date;
  /** When the file was last modified */
  updatedAt: Date;
  /** Arbitrary key-value tags */
  tags?: Record<string, string>;
  /** ETag/checksum for change detection */
  etag?: string;
}

/** Options for write operations. */
export interface WriteOptions {
  /** MIME type of the content being written */
  contentType?: string;
  /** Key-value metadata tags to associate with the file */
  tags?: Record<string, string>;
  /**
   * If true, fail if a file already exists at this path.
   * Default: false (overwrite silently).
   */
  failIfExists?: boolean;
  /**
   * Object expiry duration in seconds.
   * If supported by the backend, the file will be deleted after this time.
   */
  ttlSeconds?: number;
}

/** Options for read operations. */
export interface ReadOptions {
  /**
   * Read only a byte range from the file.
   * Useful for streaming large files.
   */
  range?: { start: number; end: number };
}

/** Result of a list operation. */
export interface ListResult {
  /** File paths matching the prefix */
  paths: string[];
  /** Whether there are more results (for paginated backends) */
  hasMore: boolean;
  /** Cursor for the next page of results */
  nextCursor?: string;
}

/** Options for listing files. */
export interface ListOptions {
  /** Maximum number of results per page (default: 100) */
  limit?: number;
  /** Pagination cursor from a previous listFiles() call */
  cursor?: string;
  /** If true, also list files in subdirectories */
  recursive?: boolean;
}

/** A pre-signed URL for temporary direct access to a file. */
export interface PresignedUrl {
  /** The pre-signed URL */
  url: string;
  /** When the URL expires */
  expiresAt: Date;
  /** HTTP method the URL is valid for */
  method: 'GET' | 'PUT';
}

/**
 * StoragePort — implement this for each file/blob storage backend.
 *
 * All paths should use forward-slash separators and not begin with '/'.
 * E.g. 'invoices/2024/01/invoice-123.pdf'
 */
export interface StoragePort {
  /**
   * Read the contents of a file.
   * @param path File path within the storage bucket/prefix.
   * @param options Optional read options (byte range, etc.)
   * @returns Raw file bytes.
   * @throws Error if the file does not exist.
   */
  read(path: string, options?: ReadOptions): Promise<Buffer>;

  /**
   * Write data to a file path.
   * Creates the file if it doesn't exist; overwrites by default.
   * @param path File path within the storage bucket/prefix.
   * @param data Content to write.
   * @param options Optional write options.
   */
  write(path: string, data: Buffer | string, options?: WriteOptions): Promise<void>;

  /**
   * Delete a file.
   * No-op if the file does not exist.
   * @param path File path to delete.
   */
  delete(path: string): Promise<void>;

  /**
   * Check whether a file exists.
   * @param path File path to check.
   * @returns true if the file exists, false otherwise.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get metadata for a file without downloading it.
   * @param path File path.
   * @returns File metadata, or null if the file does not exist.
   */
  getMetadata(path: string): Promise<StorageMetadata | null>;

  /**
   * List files under a given path prefix.
   * @param prefix Path prefix to list. Use '' or '/' for the root.
   * @param options Listing options.
   */
  listFiles(prefix: string, options?: ListOptions): Promise<ListResult>;

  /**
   * Copy a file within the same storage backend.
   * @param sourcePath Source file path.
   * @param destinationPath Destination file path.
   * @param options Optional write options for the destination.
   */
  copy(
    sourcePath: string,
    destinationPath: string,
    options?: WriteOptions,
  ): Promise<void>;

  /**
   * Move/rename a file within the same storage backend.
   * Equivalent to copy() + delete() but may be atomic on some backends.
   * @param sourcePath Source file path.
   * @param destinationPath Destination file path.
   */
  move(sourcePath: string, destinationPath: string): Promise<void>;

  /**
   * Generate a pre-signed URL for temporary direct access.
   * Not all backends support this — check supportsPresignedUrls() first.
   * @param path File path.
   * @param method HTTP method ('GET' for download, 'PUT' for upload).
   * @param expirySeconds How long the URL should be valid.
   */
  getPresignedUrl(
    path: string,
    method: 'GET' | 'PUT',
    expirySeconds: number,
  ): Promise<PresignedUrl>;

  /**
   * Whether this adapter supports pre-signed URL generation.
   */
  supportsPresignedUrls(): boolean;

  /** Human-readable storage backend name, e.g. 'Local Filesystem', 'AWS S3'. */
  getBackendName(): string;

  /**
   * Health check — returns true if the storage backend is reachable.
   */
  ping(): Promise<boolean>;
}
