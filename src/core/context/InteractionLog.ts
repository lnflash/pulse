/**
 * InteractionLog — immutable record of a single conversation turn.
 *
 * Used for audit trails, debugging, and training data generation.
 */

import { z } from 'zod';

/** A single logged interaction turn. */
export const InteractionLogEntrySchema = z.object({
  /** Unique ID for this log entry */
  id: z.string(),
  /** SHA-256 hash of the phone number */
  phoneHash: z.string(),
  /** Session ID at the time of the interaction */
  sessionId: z.string().optional(),
  /** When the interaction occurred */
  timestamp: z.date().default(() => new Date()),
  /** The user's raw message */
  userMessage: z.string(),
  /** Whether the message was voice (true) or text (false) */
  wasVoice: z.boolean().default(false),
  /** The agent's final response */
  agentResponse: z.string(),
  /** Tools that were invoked during this turn */
  toolsInvoked: z.array(z.string()).default([]),
  /** Total tokens consumed */
  tokensUsed: z.number().int().default(0),
  /** How the loop terminated */
  terminationReason: z.string().optional(),
  /** Duration in milliseconds */
  durationMs: z.number().int().default(0),
  /** Error message if something went wrong */
  error: z.string().optional(),
});

export type InteractionLogEntry = z.infer<typeof InteractionLogEntrySchema>;

/**
 * Create a new interaction log entry.
 */
export function createLogEntry(
  data: Omit<InteractionLogEntry, 'id' | 'timestamp'> & { timestamp?: Date },
): InteractionLogEntry {
  return InteractionLogEntrySchema.parse({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    ...data,
  });
}
