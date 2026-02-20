/**
 * InteractionLogStore — persists and retrieves InteractionLogEntry records.
 *
 * Each user's log is stored as a JSONL file (one JSON object per line) in:
 *   {storageRoot}/logs/{phoneHash}.jsonl
 *
 * Newest entries are appended to the end. Reading last-N is done by reading
 * the whole file and slicing the tail — suitable for typical log sizes.
 * For very high volume users, consider rotating or archiving old logs.
 */

import { mkdir, appendFile, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createLogEntry, type InteractionLogEntry } from './InteractionLog.js';
import { logger } from '../../config/logger.js';

/** Data required to create a new log entry. */
export type NewInteractionLog = Omit<InteractionLogEntry, 'id' | 'timestamp'> & {
  timestamp?: Date;
};

/**
 * InteractionLogStore — thin append-only store for conversation turn logs.
 *
 * Uses JSONL (newline-delimited JSON) for efficient append operations.
 */
export class InteractionLogStore {
  private readonly logsDir: string;

  constructor(storageRoot: string) {
    this.logsDir = join(storageRoot, 'logs');
  }

  /**
   * Ensure the logs directory exists. Call once at startup.
   */
  async init(): Promise<void> {
    if (!existsSync(this.logsDir)) {
      await mkdir(this.logsDir, { recursive: true });
      logger.info({ logsDir: this.logsDir }, 'InteractionLogStore: logs directory created');
    }
  }

  /**
   * Append a new interaction log entry for a user.
   *
   * @param data Log data (id and timestamp will be generated if omitted).
   * @returns The persisted log entry with generated id and timestamp.
   */
  async append(data: NewInteractionLog): Promise<InteractionLogEntry> {
    const entry = createLogEntry(data);
    const filePath = this.logFilePath(data.phoneHash);

    // Ensure per-user log directory is ready (logsDir may not exist yet in tests)
    await mkdir(this.logsDir, { recursive: true }).catch(() => {});

    const line = JSON.stringify(entry, replacer) + '\n';
    await appendFile(filePath, line, 'utf-8');

    logger.debug(
      { phoneHash: data.phoneHash, entryId: entry.id },
      'InteractionLogStore: entry appended',
    );

    return entry;
  }

  /**
   * Load the last N interaction log entries for a user.
   *
   * Returns an empty array if no log file exists yet.
   *
   * @param phoneHash SHA-256 hash of the phone number.
   * @param limit Maximum number of entries to return (default: 10).
   * @returns Array of log entries, oldest-first.
   */
  async loadLast(phoneHash: string, limit = 10): Promise<InteractionLogEntry[]> {
    const filePath = this.logFilePath(phoneHash);

    let raw: string;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch {
      // File not found — new user with no history
      return [];
    }

    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    const tail = lines.slice(-limit);

    const entries: InteractionLogEntry[] = [];
    for (const line of tail) {
      try {
        const parsed = JSON.parse(line, reviver) as InteractionLogEntry;
        entries.push(parsed);
      } catch (err) {
        logger.warn(
          { phoneHash, err: String(err) },
          'InteractionLogStore: failed to parse log line — skipping',
        );
      }
    }

    return entries;
  }

  /**
   * Convert recent interaction log entries into AIMessage format for
   * inclusion in AgentLoop conversation history.
   *
   * @param phoneHash SHA-256 hash of the phone number.
   * @param limit Maximum number of past turns to include.
   * @returns Array of AIMessage objects, oldest-first (system messages excluded).
   */
  async toConversationHistory(
    phoneHash: string,
    limit = 6,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const entries = await this.loadLast(phoneHash, limit);

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const entry of entries) {
      messages.push({ role: 'user', content: entry.userMessage });
      messages.push({ role: 'assistant', content: entry.agentResponse });
    }
    return messages;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private logFilePath(phoneHash: string): string {
    return join(this.logsDir, `${phoneHash}.jsonl`);
  }
}

// ---------------------------------------------------------------------------
// Date serialization helpers for JSON
// ---------------------------------------------------------------------------

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return { __type: 'Date', value: value.toISOString() };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)['__type'] === 'Date'
  ) {
    return new Date((value as Record<string, string>)['value'] as string);
  }
  return value;
}
