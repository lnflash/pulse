/**
 * MessageOrchestrator — top-level handler for incoming messages.
 *
 * Receives messages from MessagingPort adapters, routes them through
 * the security pipeline, hydrates user context, and dispatches to AgentOrchestrator.
 */

import type { IncomingMessage, MessagingPort } from '../ports/MessagingPort.js';
import type { ContextManager } from '../core/context/ContextManager.js';
import type { RateLimiter } from '../core/security/RateLimiter.js';
import type { InputSanitizer } from '../core/security/InputSanitizer.js';
import type { AuditLog } from '../core/security/AuditLog.js';
import type { AgentOrchestrator } from './AgentOrchestrator.js';
import { ContextManager as CM } from '../core/context/ContextManager.js';
import { eventBus } from './EventBus.js';
import { logger } from '../config/logger.js';

/**
 * MessageOrchestrator — wires together the full message processing pipeline:
 *
 * IncomingMessage
 *   → RateLimiter  (block if throttled)
 *   → InputSanitizer (clean + flag injections)
 *   → ContextManager.load() (hydrate UserContext)
 *   → AgentOrchestrator.handle() (run AgentLoop)
 *   → MessagingPort.sendText() (reply)
 *   → ContextManager.save() (persist updated context)
 */
export class MessageOrchestrator {
  constructor(
    private readonly messaging: MessagingPort,
    private readonly contextManager: ContextManager,
    private readonly rateLimiter: RateLimiter,
    private readonly sanitizer: InputSanitizer,
    private readonly auditLog: AuditLog,
    private readonly agentOrchestrator: AgentOrchestrator,
  ) {}

  /**
   * Register this orchestrator as the message handler on the MessagingPort.
   * Call this during application startup.
   */
  register(): void {
    this.messaging.onMessage((message) => this.handleMessage(message));
    logger.info('MessageOrchestrator registered as message handler');
  }

  /**
   * Process a single incoming message through the full pipeline.
   */
  async handleMessage(message: IncomingMessage): Promise<void> {
    const requestId = crypto.randomUUID();

    logger.info(
      {
        requestId,
        from: message.from,
        platform: message.platform,
        hasText: !!message.text,
        hasVoice: !!message.voice,
      },
      'Message received',
    );

    eventBus.emit('message.received', {
      phoneNumber: message.from,
      messageId: message.id,
      platform: message.platform,
    });

    try {
      // 1. Rate limiting
      const phoneHash = CM.hashPhone(message.from);
      const userContext = await this.contextManager.load(message.from);
      const tier = userContext.guidelines.rateLimitTier;
      const rateLimitResult = this.rateLimiter.check(phoneHash, tier);

      if (!rateLimitResult.allowed) {
        logger.warn({ phoneHash, tier }, 'Rate limit hit');
        eventBus.emit('rate.limit.hit', { phoneHash, tier });
        this.auditLog.blocked('rate_limit_hit', phoneHash, { tier }, requestId);
        await this.messaging.sendText(message.from, rateLimitResult.message!);
        return;
      }

      // 2. Input sanitization (text messages only)
      let processedText = message.text ?? '';
      if (message.text) {
        const sanitized = this.sanitizer.sanitize(message.text);
        if (sanitized.flagged) {
          logger.warn(
            { phoneHash, reason: sanitized.flagReason },
            'Flagged message received',
          );
          this.auditLog.blocked('injection_attempt', phoneHash, {
            reason: sanitized.flagReason,
          }, requestId);
        }
        processedText = sanitized.sanitized;
      }

      // 3. Show typing indicator
      await this.messaging.sendTypingIndicator(message.from).catch(() => {});

      // 4. Dispatch to AgentOrchestrator
      eventBus.emit('agent.loop.start', { phoneHash, requestId });

      const result = await this.agentOrchestrator.handle({
        message: { ...message, text: processedText },
        userContext,
        requestId,
      });

      eventBus.emit('agent.loop.complete', {
        phoneHash,
        requestId,
        durationMs: result.durationMs,
        tokensUsed: result.tokensUsed,
      });

      // 5. Send reply
      await this.messaging.sendText(message.from, result.response);

      eventBus.emit('message.sent', { phoneNumber: message.from, messageId: requestId });

      // 6. Persist updated context
      if (result.updatedContext) {
        await this.contextManager.save(message.from, result.updatedContext);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ error, from: message.from, requestId }, 'MessageOrchestrator: unhandled error');

      // Send a graceful error message
      await this.messaging.sendText(
        message.from,
        "Sorry, I encountered an unexpected error. Please try again.",
      ).catch(() => {});
    }
  }
}
