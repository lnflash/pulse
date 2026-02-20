/**
 * FileSystemAdapter — StoragePort implementation using the local filesystem.
 *
 * Suitable for local development and single-instance deployments.
 * For production, use an S3-compatible adapter.
 */

import {
  readFile,
  writeFile,
  unlink,
  access,
  stat,
  readdir,
  cp,
  rename,
  constants,
} from 'fs/promises';
import { join, dirname, relative } from 'path';
import { mkdirSync } from 'fs';
import type {
  StoragePort,
  StorageMetadata,
  WriteOptions,
  ReadOptions,
  ListResult,
  ListOptions,
  PresignedUrl,
} from '../../ports/StoragePort.js';

/**
 * FileSystemAdapter — local disk storage implementing StoragePort.
 *
 * All paths are relative to the configured root directory.
 */
export class FileSystemAdapter implements StoragePort {
  private readonly rootDir: string;

  constructor(rootDir: string = './data/storage') {
    this.rootDir = rootDir;
    // Ensure root dir exists
    mkdirSync(rootDir, { recursive: true });
  }

  private resolvePath(path: string): string {
    // Prevent path traversal attacks
    const resolved = join(this.rootDir, path);
    if (!resolved.startsWith(this.rootDir)) {
      throw new Error(`StoragePort: path traversal attempt rejected: ${path}`);
    }
    return resolved;
  }

  async read(path: string, options?: ReadOptions): Promise<Buffer> {
    const fullPath = this.resolvePath(path);
    const buffer = await readFile(fullPath);
    if (options?.range) {
      return buffer.slice(options.range.start, options.range.end + 1);
    }
    return buffer;
  }

  async write(
    path: string,
    data: Buffer | string,
    options?: WriteOptions,
  ): Promise<void> {
    const fullPath = this.resolvePath(path);

    if (options?.failIfExists && await this.exists(path)) {
      throw new Error(`StoragePort: file already exists at ${path}`);
    }

    // Ensure parent directory exists
    mkdirSync(dirname(fullPath), { recursive: true });

    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    await writeFile(fullPath, buffer);
  }

  async delete(path: string): Promise<void> {
    try {
      await unlink(this.resolvePath(path));
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(this.resolvePath(path), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(path: string): Promise<StorageMetadata | null> {
    try {
      const s = await stat(this.resolvePath(path));
      return {
        size: s.size,
        createdAt: s.birthtime,
        updatedAt: s.mtime,
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async listFiles(prefix: string, options?: ListOptions): Promise<ListResult> {
    const dir = this.resolvePath(prefix || '.');
    const recursive = options?.recursive ?? false;

    const collectFiles = async (d: string): Promise<string[]> => {
      let entries: string[];
      try {
        entries = await readdir(d);
      } catch {
        return [];
      }
      const paths: string[] = [];
      for (const entry of entries) {
        const full = join(d, entry);
        const s = await stat(full).catch(() => null);
        if (!s) continue;
        if (s.isDirectory() && recursive) {
          paths.push(...(await collectFiles(full)));
        } else if (s.isFile()) {
          paths.push(relative(this.rootDir, full));
        }
      }
      return paths;
    };

    const paths = await collectFiles(dir);
    const limit = options?.limit ?? 100;

    return {
      paths: paths.slice(0, limit),
      hasMore: paths.length > limit,
    };
  }

  async copy(src: string, dest: string, _options?: WriteOptions): Promise<void> {
    const srcPath = this.resolvePath(src);
    const destPath = this.resolvePath(dest);
    mkdirSync(dirname(destPath), { recursive: true });
    await cp(srcPath, destPath);
  }

  async move(src: string, dest: string): Promise<void> {
    const srcPath = this.resolvePath(src);
    const destPath = this.resolvePath(dest);
    mkdirSync(dirname(destPath), { recursive: true });
    await rename(srcPath, destPath);
  }

  async getPresignedUrl(
    _path: string,
    _method: 'GET' | 'PUT',
    _expirySeconds: number,
  ): Promise<PresignedUrl> {
    throw new Error('FileSystemAdapter does not support pre-signed URLs');
  }

  supportsPresignedUrls(): boolean {
    return false;
  }

  getBackendName(): string {
    return 'Local Filesystem';
  }

  async ping(): Promise<boolean> {
    try {
      await access(this.rootDir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}
