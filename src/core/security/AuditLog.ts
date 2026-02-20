/**
 * AuditLog — structured audit trail for security-sensitive events.
 */

import { logger } from '../../config/logger.js';

/** Categories of auditable events. */
export type AuditEventType =
  | 'payment_initiated'
  | 'payment_confirmed'
  | 'payment_declined'
  | 'payment_failed'
  | 'account_linked'
  | 'account_unlinked'
  | 'otp_requested'
  | 'otp_verified'
  | 'otp_failed'
  | 'rate_limit_hit'
  | 'injection_attempt'
  | 'escalation'
  | 'kyc_updated'
  | 'context_deleted'
  | 'admin_action';

/** A single audit log entry. */
export interface AuditEntry {
  /** Unique entry ID */
  id: string;
  /** When this event occurred */
  timestamp: Date;
  /** Type of event */
  eventType: AuditEventType;
  /** SHA-256 hash of the phone number involved */
  phoneHash: string;
  /** Correlation request ID */
  requestId?: string;
  /** Structured event data */
  data: Record<string, unknown>;
  /** IP address or platform identifier */
  source?: string;
  /** Outcome: success, failure, or blocked */
  outcome: 'success' | 'failure' | 'blocked';
}

/**
 * AuditLog — logs security events to the structured logger.
 *
 * In production, these entries should also be shipped to an immutable
 * append-only store (e.g. CloudWatch, BigQuery, dedicated audit DB).
 * This scaffold logs to Pino; the persistence adapter is added in Week 4.
 */
export class AuditLog {
  /**
   * Record a security-sensitive event.
   * @param entry Audit entry data (id and timestamp are auto-generated).
   */
  record(
    entry: Omit<AuditEntry, 'id' | 'timestamp'>,
  ): AuditEntry {
    const full: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...entry,
    };

    // Log at appropriate level based on outcome
    const logFn = entry.outcome === 'success' ? logger.info : logger.warn;
    logFn.call(logger, {
      audit: true,
      eventType: full.eventType,
      phoneHash: full.phoneHash,
      requestId: full.requestId,
      outcome: full.outcome,
      data: full.data,
    }, `AUDIT: ${full.eventType}`);

    return full;
  }

  /** Shorthand: record a successful event. */
  success(
    eventType: AuditEventType,
    phoneHash: string,
    data: Record<string, unknown> = {},
    requestId?: string,
  ): AuditEntry {
    return this.record({ eventType, phoneHash, data, requestId, outcome: 'success' });
  }

  /** Shorthand: record a failed event. */
  failure(
    eventType: AuditEventType,
    phoneHash: string,
    data: Record<string, unknown> = {},
    requestId?: string,
  ): AuditEntry {
    return this.record({ eventType, phoneHash, data, requestId, outcome: 'failure' });
  }

  /** Shorthand: record a blocked event. */
  blocked(
    eventType: AuditEventType,
    phoneHash: string,
    data: Record<string, unknown> = {},
    requestId?: string,
  ): AuditEntry {
    return this.record({ eventType, phoneHash, data, requestId, outcome: 'blocked' });
  }
}
