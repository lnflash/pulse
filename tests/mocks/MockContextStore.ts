/**
 * MockContextStore — in-memory implementation of ContextStorePort for tests.
 */

import type {
  ContextStorePort,
  ContextLookupResult,
  ContextStoreOptions,
} from '../../src/ports/ContextStorePort';
import type { UserContext } from '../../src/core/context/UserContext';

/**
 * MockContextStore — simple in-memory context store.
 */
export class MockContextStore implements ContextStorePort {
  private readonly store: Map<string, UserContext> = new Map();
  private readonly touchLog: Array<{ phoneHash: string; ttlSeconds: number }> = [];

  private shouldFailLoad = false;
  private shouldFailSave = false;

  // ── Setup helpers ────────────────────────────────────────────────────────

  seed(phoneHash: string, context: UserContext): this {
    this.store.set(phoneHash, context);
    return this;
  }

  failOnLoad(): this {
    this.shouldFailLoad = true;
    return this;
  }

  failOnSave(): this {
    this.shouldFailSave = true;
    return this;
  }

  reset(): this {
    this.store.clear();
    this.touchLog.length = 0;
    this.shouldFailLoad = false;
    this.shouldFailSave = false;
    return this;
  }

  getAll(): Map<string, UserContext> {
    return new Map(this.store);
  }

  getTouchLog(): Array<{ phoneHash: string; ttlSeconds: number }> {
    return [...this.touchLog];
  }

  // ── ContextStorePort implementation ─────────────────────────────────────

  async loadContext(phoneHash: string): Promise<ContextLookupResult> {
    if (this.shouldFailLoad) {
      this.shouldFailLoad = false;
      throw new Error('MockContextStore: loadContext failed (configured to fail)');
    }
    const context = this.store.get(phoneHash) ?? null;
    return { context, found: context !== null };
  }

  async saveContext(
    phoneHash: string,
    context: UserContext,
    _options?: ContextStoreOptions,
  ): Promise<void> {
    if (this.shouldFailSave) {
      this.shouldFailSave = false;
      throw new Error('MockContextStore: saveContext failed (configured to fail)');
    }
    this.store.set(phoneHash, context);
  }

  async deleteContext(phoneHash: string): Promise<void> {
    this.store.delete(phoneHash);
  }

  async hasContext(phoneHash: string): Promise<boolean> {
    return this.store.has(phoneHash);
  }

  async touchContext(phoneHash: string, ttlSeconds: number): Promise<boolean> {
    this.touchLog.push({ phoneHash, ttlSeconds });
    return this.store.has(phoneHash);
  }

  async patchContext(
    phoneHash: string,
    patch: Partial<UserContext>,
  ): Promise<void> {
    const existing = this.store.get(phoneHash);
    if (existing) {
      this.store.set(phoneHash, { ...existing, ...patch });
    }
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
