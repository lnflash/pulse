/**
 * InputSanitizer — clean and validate incoming user messages before processing.
 */

/** Result of input sanitization. */
export interface SanitizeResult {
  /** Sanitized text safe for processing */
  sanitized: string;
  /** Original input */
  original: string;
  /** Whether the input was modified */
  wasModified: boolean;
  /** Whether the input was flagged as potentially malicious */
  flagged: boolean;
  /** Reason for flagging, if any */
  flagReason?: string;
}

/** Maximum message length (characters) before truncation. */
const MAX_MESSAGE_LENGTH = 4096;

/** Patterns that suggest prompt injection attempts. */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(a\s+)?(?:different|new|another)\s+(ai|bot|assistant)/i,
  /forget\s+(your|all)\s+(instructions|rules|guidelines)/i,
  /pretend\s+(you\s+are|to\s+be)\s+(?!a\s+person)/i,
  /system\s*:\s*you\s+are/i,
  /\[SYSTEM\]/i,
  /<\|system\|>/i,
];

/**
 * InputSanitizer — applies basic sanitization and injection detection.
 *
 * This is a first line of defense. The AI model's system prompt
 * provides the primary guard against manipulation.
 */
export class InputSanitizer {
  /**
   * Sanitize a user's incoming message.
   * @param input Raw message from the user.
   */
  sanitize(input: string): SanitizeResult {
    const original = input;
    let sanitized = input;
    let flagged = false;
    let flagReason: string | undefined;

    // Truncate extremely long messages
    if (sanitized.length > MAX_MESSAGE_LENGTH) {
      sanitized = sanitized.slice(0, MAX_MESSAGE_LENGTH);
    }

    // Strip null bytes and other control characters (keep newlines/tabs)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Check for prompt injection patterns
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        flagged = true;
        flagReason = 'Potential prompt injection attempt detected';
        // Don't modify — let the AI model handle it; just flag for logging
        break;
      }
    }

    // Normalize whitespace (collapse multiple spaces/newlines)
    sanitized = sanitized.replace(/\s{3,}/g, '\n\n').trim();

    return {
      sanitized,
      original,
      wasModified: sanitized !== original,
      flagged,
      flagReason,
    };
  }

  /**
   * Check whether a string looks like a valid E.164 phone number.
   */
  isValidE164(phone: string): boolean {
    return /^\+[1-9]\d{7,14}$/.test(phone.trim());
  }

  /**
   * Validate that a string is a plausible Lightning invoice (BOLT11).
   * Does not perform full BOLT11 decoding; checks structure only.
   */
  isPlausibleInvoice(str: string): boolean {
    return /^ln(bc|tb|bcrt)\d+[munp]?[a-z0-9]+$/i.test(str.trim());
  }

  /**
   * Validate that a string looks like a Lightning address (user@domain).
   */
  isValidLightningAddress(str: string): boolean {
    return /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(str.trim());
  }
}
