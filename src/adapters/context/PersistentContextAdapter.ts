/**
 * PersistentContextAdapter — ContextStorePort implementation using encrypted filesystem storage.
 *
 * Stores UserContext as AES-256-GCM encrypted JSON files. Used as the cold store
 * (durable persistence) in the write-through cache pattern alongside Redis.
 *
 * Path format: `{basePath}/{phoneHash}/context.json`
 *
 * Encryption:
 *   - Algorithm: AES-256-GCM (authenticated encryption)
 *   - Key derivation: SHA-256 of the provided encryptionKey → 32-byte key
 *   - Encoding: Base64 blob = IV (12 bytes) || Auth tag (16 bytes) || ciphertext
 *
 * TTL is not enforced (files persist until deleted). Multi-instance deployments
 * should use Redis as the primary cache; this adapter is the durable backing store.
 */

import { readFile, writeFile, rm, access, mkdir, constants } from 'fs/promises';
import { join } from 'path';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';
import { UserContextSchema, type UserContext } from '../../core/context/UserContext.js';
import type {
  ContextStorePort,
  ContextLookupResult,
  ContextStoreOptions,
} from '../../ports/ContextStorePort.js';
import { logger } from '../../config/logger.js';

// ---------------------------------------------------------------------------
// Encryption constants
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm' as const;
/** GCM recommended IV length (96 bits). */
const IV_LENGTH = 12;
/** GCM authentication tag length (128 bits). */
const AUTH_TAG_LENGTH = 16;

/** Constructor options for PersistentContextAdapter. */
export interface PersistentContextAdapterOptions {
  /** Base directory where context files are stored. Created if it doesn't exist. */
  basePath: string;
  /**
   * Encryption key material. Will be hashed to a 32-byte AES-256 key via SHA-256.
   * Store this in an environment variable (e.g. CONTEXT_ENCRYPTION_KEY).
   */
  encryptionKey: string;
}

/**
 * PersistentContextAdapter — durable, encrypted file-based context store.
 *
 * Each user's context is stored under its own directory:
 *   `{basePath}/{phoneHash}/context.json`
 *
 * The file contains a Base64-encoded blob:
 *   `[IV (12 B)][Auth tag (16 B)][Ciphertext]`
 */
export class PersistentContextAdapter implements ContextStorePort {
  private readonly basePath: string;
  /** 32-byte AES-256 key derived from the supplied key material. */
  private readonly encryptionKey: Buffer;

  constructor(options: PersistentContextAdapterOptions) {
    this.basePath = options.basePath;
    // Derive a fixed-length 32-byte key via SHA-256
    this.encryptionKey = createHash('sha256')
      .update(options.encryptionKey)
      .digest();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private contextPath(phoneHash: string): string {
    return join(this.basePath, phoneHash, 'context.json');
  }

  private dirPath(phoneHash: string): string {
    return join(this.basePath, phoneHash);
  }

  /** Encrypt a plaintext string → Base64 blob. */
  private encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    // Layout: IV | auth tag | ciphertext → Base64
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /** Decrypt a Base64 blob → plaintext string. */
  private decrypt(encoded: string): string {
    const buf = Buffer.from(encoded, 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(tag);

    return (
      decipher.update(ciphertext).toString('utf8') +
      decipher.final('utf8')
    );
  }

  // ---------------------------------------------------------------------------
  // ContextStorePort implementation
  // ---------------------------------------------------------------------------

  async loadContext(phoneHash: string): Promise<ContextLookupResult> {
    const path = this.contextPath(phoneHash);
    try {
      const raw = await readFile(path, 'utf-8');
      const decrypted = this.decrypt(raw.trim());
      const parsed = JSON.parse(decrypted, reviveDate);
      const context = UserContextSchema.parse(parsed);
      logger.debug({ phoneHash }, 'PersistentContextAdapter: context loaded');
      return { context, found: true };
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        // Normal case — new user
        return { context: null, found: false };
      }
      logger.error(
        { phoneHash, error: e.message },
        'PersistentContextAdapter: failed to load context',
      );
      return { context: null, found: false };
    }
  }

  async saveContext(
    phoneHash: string,
    context: UserContext,
    _options?: ContextStoreOptions,
  ): Promise<void> {
    const dir = this.dirPath(phoneHash);
    const path = this.contextPath(phoneHash);
    try {
      // Ensure the per-user directory exists
      await mkdir(dir, { recursive: true });
      const json = JSON.stringify(context);
      const encrypted = this.encrypt(json);
      await writeFile(path, encrypted, 'utf-8');
      logger.debug({ phoneHash }, 'PersistentContextAdapter: context saved');
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(
        { phoneHash, error },
        'PersistentContextAdapter: failed to save context',
      );
      throw err;
    }
  }

  async deleteContext(phoneHash: string): Promise<void> {
    const dir = this.dirPath(phoneHash);
    try {
      // Remove the entire per-user directory
      await rm(dir, { recursive: true, force: true });
      logger.debug({ phoneHash }, 'PersistentContextAdapter: context deleted');
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(
        { phoneHash, error },
        'PersistentContextAdapter: failed to delete context',
      );
    }
  }

  async hasContext(phoneHash: string): Promise<boolean> {
    try {
      await access(this.contextPath(phoneHash), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async touchContext(phoneHash: string, _ttlSeconds: number): Promise<boolean> {
    // Filesystem store does not support TTL; return whether the file exists
    return this.hasContext(phoneHash);
  }

  async patchContext(phoneHash: string, patch: Partial<UserContext>): Promise<void> {
    const { context } = await this.loadContext(phoneHash);
    if (!context) {
      throw new Error(
        `PersistentContextAdapter: no context found for phoneHash ${phoneHash}`,
      );
    }
    const merged = UserContextSchema.parse({
      ...context,
      ...patch,
      meta: { ...context.meta, ...patch.meta, updatedAt: new Date() },
    });
    await this.saveContext(phoneHash, merged);
  }

  async ping(): Promise<boolean> {
    try {
      await access(this.basePath, constants.W_OK);
      return true;
    } catch {
      // Try to create the base directory — it may not exist yet
      try {
        await mkdir(this.basePath, { recursive: true });
        return true;
      } catch {
        return false;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// JSON reviver — restore ISO 8601 strings to Date objects
// ---------------------------------------------------------------------------

function reviveDate(_key: string, value: unknown): unknown {
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
  ) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  return value;
}
