/**
 * ErrorHandler — graceful degradation for Pulse v5 agent errors.
 *
 * Provides a unified strategy for handling errors across the agent stack:
 *
 * | Error type              | Strategy                                         |
 * |-------------------------|--------------------------------------------------|
 * | AI provider failure     | Try fallback provider (Claude → Gemini)          |
 * | Flash API timeout       | Return friendly "unavailable" message            |
 * | Context load failure    | Proceed with empty context + log warning         |
 * | Generic error           | User-friendly message, never expose internals    |
 *
 * Core pattern: `withGracefulDegradation(fn, fallbackMessage)`
 * Wraps any async operation and catches all errors, returning the fallback
 * message string instead of re-throwing.
 */

import { logger } from '../../config/logger.js';

// ---------------------------------------------------------------------------
// Named error classes — throw these to get specific handling
// ---------------------------------------------------------------------------

/**
 * Thrown when an AI provider (Claude, Gemini, etc.) is unreachable or returns
 * a non-retryable error. Triggers fallback provider logic.
 */
export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/**
 * Thrown when the Flash API exceeds its configured request timeout.
 * Results in a wallet-unavailable friendly message.
 */
export class FlashAPITimeoutError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'FlashAPITimeoutError';
  }
}

/**
 * Thrown when a user's context cannot be loaded from the store.
 * The caller should proceed with an empty/default context.
 */
export class ContextLoadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ContextLoadError';
  }
}

// ---------------------------------------------------------------------------
// User-facing messages
// ---------------------------------------------------------------------------

const MESSAGES = {
  aiUnavailable:
    "I'm having trouble processing your request right now. Please try again in a moment.",
  walletUnavailable:
    "The wallet service is temporarily unavailable. Please try again in a few moments.",
  genericError:
    "Something went wrong. Please try again or contact support if the problem persists.",
  contextEmpty:
    "Welcome! I'm Pulse, your financial assistant. How can I help you today?",
} as const;

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export type ErrorCategory =
  | 'ai_provider'
  | 'flash_timeout'
  | 'context_load'
  | 'generic';

/**
 * Classify an error into a handling category.
 * Order matters — more specific checks come first.
 */
function classifyError(err: unknown): ErrorCategory {
  if (err instanceof AIProviderError) return 'ai_provider';
  if (err instanceof FlashAPITimeoutError) return 'flash_timeout';
  if (err instanceof ContextLoadError) return 'context_load';

  // Heuristic classification by message content
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (
    msg.includes('anthropic') ||
    msg.includes('claude') ||
    msg.includes('gemini') ||
    msg.includes('generative ai') ||
    msg.includes('ai provider')
  ) {
    return 'ai_provider';
  }

  if (
    (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) &&
    (msg.includes('flash') || msg.includes('wallet') || msg.includes('graphql'))
  ) {
    return 'flash_timeout';
  }

  return 'generic';
}

// ---------------------------------------------------------------------------
// ErrorHandler
// ---------------------------------------------------------------------------

/** Options for creating an ErrorHandler instance. */
export interface ErrorHandlerConfig {
  /**
   * Called when the primary AI provider fails.
   * Should invoke the fallback provider and return its response.
   * If omitted, a static fallback message is returned.
   */
  fallbackAIProvider?: () => Promise<string>;
}

/**
 * ErrorHandler — centralised graceful degradation logic.
 *
 * Prefer the `withGracefulDegradation` helper for simple wrapping. Use the
 * individual `handle*` methods when you need finer-grained control.
 *
 * @example
 * // Simple wrapping:
 * const result = await errorHandler.withGracefulDegradation(
 *   () => agentLoop.run(userText),
 *   "I'm having trouble. Please try again.",
 * );
 *
 * @example
 * // Typed handling:
 * try {
 *   return await agentLoop.run(userText);
 * } catch (err) {
 *   return errorHandler.handleGenericError(err, 'AgentLoop');
 * }
 */
export class ErrorHandler {
  private readonly fallbackAIProvider?: () => Promise<string>;

  constructor(config: ErrorHandlerConfig = {}) {
    this.fallbackAIProvider = config.fallbackAIProvider;
  }

  // ---------------------------------------------------------------------------
  // Core pattern
  // ---------------------------------------------------------------------------

  /**
   * Wrap an async function with graceful degradation.
   *
   * If `fn` resolves, its value is returned unchanged.
   * If `fn` rejects with any error, `fallbackMessage` is returned as a string.
   *
   * Never re-throws — safe to use at the message-handling boundary.
   *
   * @param fn              The async operation to attempt.
   * @param fallbackMessage Message to return if `fn` throws.
   * @returns The result of `fn`, or `fallbackMessage` on failure.
   */
  async withGracefulDegradation<T>(
    fn: () => Promise<T>,
    fallbackMessage: string,
  ): Promise<T | string> {
    try {
      return await fn();
    } catch (err) {
      const category = classifyError(err);
      const errMsg = err instanceof Error ? err.message : String(err);

      logger.warn(
        { error: errMsg, category },
        'ErrorHandler: graceful degradation triggered',
      );

      return fallbackMessage;
    }
  }

  // ---------------------------------------------------------------------------
  // Specific handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle AI provider failure.
   *
   * Attempts the configured fallback provider first. If no fallback is configured,
   * or if the fallback also fails, returns a friendly unavailable message.
   *
   * @param err   The error from the primary AI provider.
   * @returns     The fallback response or a friendly error message.
   */
  async handleAIProviderFailure(err: unknown): Promise<string> {
    const errMsg = err instanceof Error ? err.message : String(err);
    const provider = err instanceof AIProviderError ? err.provider : 'unknown';

    logger.warn(
      { error: errMsg, provider },
      'ErrorHandler: AI provider failure — attempting fallback',
    );

    if (this.fallbackAIProvider) {
      try {
        logger.info({ provider }, 'ErrorHandler: trying fallback AI provider');
        const response = await this.fallbackAIProvider();
        logger.info('ErrorHandler: fallback AI provider succeeded');
        return response;
      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        logger.error(
          { error: fallbackMsg },
          'ErrorHandler: fallback AI provider also failed',
        );
      }
    }

    return MESSAGES.aiUnavailable;
  }

  /**
   * Handle Flash API timeout.
   *
   * @param err   The timeout error (logged but not exposed to users).
   * @returns     A friendly wallet-unavailable message.
   */
  handleFlashAPITimeout(err?: unknown): string {
    const errMsg = err instanceof Error ? err.message : String(err ?? 'timeout');
    logger.warn({ error: errMsg }, 'ErrorHandler: Flash API timeout');
    return MESSAGES.walletUnavailable;
  }

  /**
   * Handle context load failure.
   *
   * Logs a warning and returns normally — callers should proceed with an
   * empty/default context (do NOT abort the request).
   *
   * @param err         The error that caused the context load to fail.
   * @param phoneHash   Phone hash for the affected user (for log correlation).
   */
  handleContextLoadFailure(err: unknown, phoneHash: string): void {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { error: errMsg, phoneHash },
      'ErrorHandler: context load failure — proceeding with empty context',
    );
  }

  /**
   * Handle a generic, unclassified error.
   *
   * Logs the full error internally but returns only a safe, user-friendly
   * message. Never exposes stack traces or internal details.
   *
   * @param err     The error that occurred.
   * @param context Optional label for log correlation (e.g. 'AgentLoop', 'ToolRegistry').
   * @returns       A user-friendly error message.
   */
  handleGenericError(err: unknown, context?: string): string {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ error: errMsg, context }, 'ErrorHandler: unhandled error');
    return MESSAGES.genericError;
  }

  /**
   * Route an error to the appropriate handler and return a user-facing string.
   *
   * Convenience method that classifies the error and delegates:
   *  - AI errors         → `handleAIProviderFailure` (async, tries fallback)
   *  - Timeout errors    → `handleFlashAPITimeout`
   *  - Context errors    → logs warning, returns empty-context message
   *  - Everything else   → `handleGenericError`
   *
   * @param err       The error to handle.
   * @param phoneHash Phone hash for log correlation (required for context errors).
   */
  async handleError(err: unknown, phoneHash?: string): Promise<string> {
    const category = classifyError(err);

    switch (category) {
      case 'ai_provider':
        return this.handleAIProviderFailure(err);

      case 'flash_timeout':
        return this.handleFlashAPITimeout(err);

      case 'context_load':
        this.handleContextLoadFailure(err, phoneHash ?? 'unknown');
        return MESSAGES.contextEmpty;

      case 'generic':
      default:
        return this.handleGenericError(err);
    }
  }

  /**
   * Classify an error into a handling category (exported for testing).
   */
  static classify(err: unknown): ErrorCategory {
    return classifyError(err);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Shared singleton for use across the application. */
export const errorHandler = new ErrorHandler();
