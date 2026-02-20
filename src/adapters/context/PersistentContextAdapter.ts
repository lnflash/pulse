/**
 * PersistentContextAdapter — ContextStorePort implementation using the filesystem.
 *
 * Writes UserContext as JSON files to disk. Used for local development
 * when Redis is not available. Not suitable for multi-instance deployments.
 */

import { readFile, writeFile, unlink, access, constants } from 'fs/promises';
import { join } from 'path';
import { UserContextSchema, type UserContext } from '../../core/context/UserContext.js';
import type {
  ContextStorePort,
  ContextLookupResult,
  ContextStoreOptions,
} from '../../ports/ContextStorePort.js';
import { logger } from '../../config/logger.js';

/**
 * PersistentContextAdapter — file-based context store for local dev.
 *
 * Stores context as JSON files at `{dataDir}/{phoneHash}.json`.
 * TTL is not enforced (files persist until deleted).
 */
export class PersistentContextAdapter implements ContextStorePort {
  private readonly dataDir: string;

  constructor(dataDir: string = './data/contexts') {
    this.dataDir = dataDir;
  }

  private filePath(phoneHash: string): string {
    return join(this.dataDir, `${phoneHash}.json`);
  }

  async loadContext(phoneHash: string): Promise<ContextLookupResult> {
    const path = this.filePath(phoneHash);
    try {
      const raw = await readFile(path, 'utf-8');
      const parsed = JSON.parse(raw, reviveDate);
      const context = UserContextSchema.parse(parsed);
      return { context, found: true };
    } catch (err: any) {
      if (err.code === 'ENOENT') return { context: null, found: false };
      logger.error({ phoneHash, error: err.message }, 'PersistentContextAdapter: load error');
      return { context: null, found: false };
    }
  }

  async saveContext(
    phoneHash: string,
    context: UserContext,
    _options?: ContextStoreOptions,
  ): Promise<void> {
    const path = this.filePath(phoneHash);
    await writeFile(path, JSON.stringify(context, null, 2), 'utf-8');
  }

  async deleteContext(phoneHash: string): Promise<void> {
    try {
      await unlink(this.filePath(phoneHash));
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async hasContext(phoneHash: string): Promise<boolean> {
    try {
      await access(this.filePath(phoneHash), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async touchContext(_phoneHash: string, _ttlSeconds: number): Promise<boolean> {
    // File-based store doesn't support TTL; return true if file exists
    return this.hasContext(_phoneHash);
  }

  async patchContext(phoneHash: string, patch: Partial<UserContext>): Promise<void> {
    const { context } = await this.loadContext(phoneHash);
    if (!context) throw new Error(`No context for ${phoneHash}`);
    const merged = UserContextSchema.parse({ ...context, ...patch });
    await this.saveContext(phoneHash, merged);
  }

  async ping(): Promise<boolean> {
    try {
      await access(this.dataDir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}

function reviveDate(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  return value;
}
