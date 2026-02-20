/**
 * PromptLoader — loads system/capability prompt files at runtime.
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = join(__dirname, '..', 'prompts');

/**
 * PromptLoader — reads Markdown prompt files from src/prompts/.
 *
 * Caches loaded prompts in memory to avoid repeated disk reads.
 */
export class PromptLoader {
  private readonly cache: Map<string, string> = new Map();

  /**
   * Load a prompt file by its relative path (without extension).
   * @param name Prompt path relative to src/prompts/, e.g. 'system/base-agent'
   * @returns The prompt file contents.
   */
  async load(name: string): Promise<string> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    const filePath = join(PROMPTS_DIR, `${name}.md`);

    try {
      const content = await readFile(filePath, 'utf-8');
      this.cache.set(name, content);
      logger.debug({ name, path: filePath }, 'Prompt loaded');
      return content;
    } catch (err) {
      logger.warn({ name, path: filePath }, 'Prompt file not found — using empty string');
      return '';
    }
  }

  /**
   * Clear the prompt cache (useful in tests or after hot-reloading prompts).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Pre-warm the cache by loading all prompts at startup.
   */
  async warmCache(names: string[]): Promise<void> {
    await Promise.all(names.map((name) => this.load(name)));
  }
}
