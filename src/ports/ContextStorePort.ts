/**
 * ContextStorePort — hexagonal boundary for UserContext persistence.
 * Adapters for Redis, PostgreSQL, DynamoDB, etc. implement this interface.
 *
 * Keys are phoneHash values (SHA-256 of E.164 phone number) to avoid
 * storing raw phone numbers in the cache layer.
 */

import type { UserContext } from '../core/context/UserContext.js';

/** Options for context store operations. */
export interface ContextStoreOptions {
  /**
   * TTL in seconds for the stored context.
   * If omitted, the adapter uses its configured default TTL.
   */
  ttlSeconds?: number;
}

/** Result of a context lookup. */
export interface ContextLookupResult {
  /** The loaded context, or null if not found. */
  context: UserContext | null;
  /** Whether the context was found in the store. */
  found: boolean;
  /**
   * Age of the stored context in seconds.
   * Undefined if the store doesn't track creation time.
   */
  ageSeconds?: number;
}

/**
 * ContextStorePort — implement this for every context persistence backend.
 *
 * All operations must be safe to call concurrently for different phoneHash
 * values. Callers are responsible for serializing concurrent writes for
 * the same phoneHash.
 */
export interface ContextStorePort {
  /**
   * Load a user's context from the store.
   * @param phoneHash SHA-256 hash of the user's E.164 phone number
   * @returns Lookup result with the context or null if not found
   */
  loadContext(phoneHash: string): Promise<ContextLookupResult>;

  /**
   * Persist a user's context to the store.
   * Overwrites any existing context for the same phoneHash.
   * @param phoneHash SHA-256 hash of the user's E.164 phone number
   * @param context The UserContext to persist
   * @param options Optional persistence options (TTL, etc.)
   */
  saveContext(
    phoneHash: string,
    context: UserContext,
    options?: ContextStoreOptions,
  ): Promise<void>;

  /**
   * Delete a user's context from the store.
   * No-op if the context doesn't exist.
   * @param phoneHash SHA-256 hash of the user's E.164 phone number
   */
  deleteContext(phoneHash: string): Promise<void>;

  /**
   * Check whether a context exists for the given key.
   * @param phoneHash SHA-256 hash of the user's E.164 phone number
   */
  hasContext(phoneHash: string): Promise<boolean>;

  /**
   * Extend the TTL of an existing context without modifying it.
   * Used to refresh the expiry for active sessions.
   * @param phoneHash SHA-256 hash of the user's E.164 phone number
   * @param ttlSeconds New TTL from now
   * @returns true if the context existed and was refreshed, false otherwise
   */
  touchContext(phoneHash: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Atomically update a subset of context fields.
   * More efficient than loadContext → modify → saveContext for partial updates.
   * @param phoneHash SHA-256 hash of the user's E.164 phone number
   * @param patch Partial UserContext with only the fields to update
   */
  patchContext(
    phoneHash: string,
    patch: Partial<UserContext>,
  ): Promise<void>;

  /**
   * Health check — returns true if the context store is reachable.
   */
  ping(): Promise<boolean>;
}
