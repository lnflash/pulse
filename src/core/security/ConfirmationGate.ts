/**
 * ConfirmationGate — manages multi-turn confirmation flows for irreversible actions.
 *
 * When a user requests a payment or other irreversible action, the gate
 * stores a pending action and waits for explicit confirmation before proceeding.
 */

import type { UserContext } from '../context/UserContext.js';
import { logger } from '../../config/logger.js';

/** A pending action awaiting user confirmation. */
export interface PendingAction {
  /** Unique ID for this pending action */
  id: string;
  /** The tool name to execute upon confirmation */
  toolName: string;
  /** The tool parameters to use upon confirmation */
  toolParams: Record<string, unknown>;
  /** Human-readable description of the action for display */
  description: string;
  /** When this pending action was created */
  createdAt: Date;
  /** When this action expires (user must confirm within this window) */
  expiresAt: Date;
  /** SHA-256 hash of the phone number this action belongs to */
  phoneHash: string;
}

/** Result of a confirmation check. */
export type ConfirmationCheckResult =
  | { status: 'confirmed'; action: PendingAction }
  | { status: 'declined'; action: PendingAction }
  | { status: 'expired'; action: PendingAction }
  | { status: 'no_pending' };

/** Phrases that count as confirmation. */
const CONFIRMATION_PHRASES = [
  'yes', 'confirm', 'ok', 'okay', 'send', 'do it', 'proceed',
  'correct', 'right', 'yep', 'yup', 'go ahead', 'approve',
  // Jamaican Patois
  'ya man', 'aye', 'zeen', 'alright',
  // Trinidadian
  'oui', 'yes boss', 'aight',
];

/** Phrases that count as declination. */
const DECLINATION_PHRASES = [
  'no', 'cancel', 'stop', 'nope', 'nah', 'never mind', 'nevermind',
  'back', 'abort', 'decline', 'reject',
  // Patois
  'nuh', 'cyaan',
];

/**
 * ConfirmationGate — in-memory store for pending confirmations.
 *
 * In production, pending actions should be persisted via ContextStorePort
 * to survive restarts. This implementation uses in-memory storage for
 * the scaffold; persistence is added in Week 3.
 */
export class ConfirmationGate {
  /** In-memory store: phoneHash → PendingAction */
  private readonly pending: Map<string, PendingAction> = new Map();

  /** Default expiry window in milliseconds. */
  private readonly expiryMs: number;

  constructor(options: { expiryMs?: number } = {}) {
    this.expiryMs = options.expiryMs ?? 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Store a pending action for a user, awaiting their confirmation.
   * @param context User context.
   * @param toolName Tool to execute on confirmation.
   * @param toolParams Tool parameters.
   * @param description Human-readable description for display.
   * @returns The pending action ID.
   */
  storePending(
    context: UserContext,
    toolName: string,
    toolParams: Record<string, unknown>,
    description: string,
  ): PendingAction {
    const now = new Date();
    const action: PendingAction = {
      id: crypto.randomUUID(),
      toolName,
      toolParams,
      description,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.expiryMs),
      phoneHash: context.identity.phoneHash,
    };

    this.pending.set(context.identity.phoneHash, action);
    logger.debug(
      { phoneHash: context.identity.phoneHash, toolName, actionId: action.id },
      'Pending action stored',
    );
    return action;
  }

  /**
   * Check if a user's message is a confirmation or declination of a pending action.
   * @param context User context.
   * @param message The user's response message.
   */
  checkConfirmation(context: UserContext, message: string): ConfirmationCheckResult {
    const phoneHash = context.identity.phoneHash;
    const action = this.pending.get(phoneHash);

    if (!action) {
      return { status: 'no_pending' };
    }

    if (new Date() > action.expiresAt) {
      this.pending.delete(phoneHash);
      return { status: 'expired', action };
    }

    const normalized = message.toLowerCase().trim();

    if (CONFIRMATION_PHRASES.some((p) => normalized.startsWith(p) || normalized === p)) {
      this.pending.delete(phoneHash);
      logger.info({ phoneHash, actionId: action.id, toolName: action.toolName }, 'Action confirmed');
      return { status: 'confirmed', action };
    }

    if (DECLINATION_PHRASES.some((p) => normalized.startsWith(p) || normalized === p)) {
      this.pending.delete(phoneHash);
      logger.info({ phoneHash, actionId: action.id }, 'Action declined');
      return { status: 'declined', action };
    }

    return { status: 'no_pending' };
  }

  /**
   * Clear any pending action for a user (e.g. when starting a new conversation).
   */
  clearPending(phoneHash: string): void {
    this.pending.delete(phoneHash);
  }

  /**
   * Check whether a user has a pending action.
   */
  hasPending(phoneHash: string): boolean {
    const action = this.pending.get(phoneHash);
    if (!action) return false;
    if (new Date() > action.expiresAt) {
      this.pending.delete(phoneHash);
      return false;
    }
    return true;
  }
}
