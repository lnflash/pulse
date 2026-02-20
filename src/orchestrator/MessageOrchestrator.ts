/**
 * MessageOrchestrator — top-level handler for incoming messages.
 *
 * Full pipeline:
 *   IncomingMessage
 *     → RateLimiter           (block if throttled)
 *     → InputSanitizer        (clean + flag injections)
 *     → ContextManager.load() (hydrate UserContext)
 *     → VoicePort.STT         (if voice message: transcribe audio → text)
 *     → DialectClassifier     (update context.understanding with dialect info)
 *     → DialectNormalizer     (translate Patois/Creole → standard English)
 *     → PromptLoader.compose()  (build layered system prompt)
 *     → AgentOrchestrator.handle() (run AgentLoop with history)
 *     → VoicePort.TTS         (if user prefers voice: synthesize audio)
 *     → MessagingPort.send    (deliver reply)
 *     → ContextManager.save() (persist updated context)
 *     → InteractionLogStore   (append turn record)
 */

import { createHash } from 'crypto';
import type { IncomingMessage, MessagingPort } from '../ports/MessagingPort.js';
import type { VoicePort } from '../ports/VoicePort.js';
import type { ContextManager } from '../core/context/ContextManager.js';
import type { RateLimiter } from '../core/security/RateLimiter.js';
import type { InputSanitizer } from '../core/security/InputSanitizer.js';
import type { AuditLog } from '../core/security/AuditLog.js';
import type { AgentOrchestrator } from './AgentOrchestrator.js';
import type { PromptLoader } from '../config/PromptLoader.js';
import type { InteractionLogStore } from '../core/context/InteractionLogStore.js';
import { DialectClassifier } from '../core/dialect/DialectClassifier.js';
import { DialectNormalizer } from '../core/dialect/DialectNormalizer.js';
import { patchContext } from '../core/context/UserContext.js';
import { eventBus } from './EventBus.js';
import { logger } from '../config/logger.js';

/** Dependencies injected into MessageOrchestrator. */
export interface MessageOrchestratorDeps {
  messaging: MessagingPort;
  contextManager: ContextManager;
  rateLimiter: RateLimiter;
  sanitizer: InputSanitizer;
  auditLog: AuditLog;
  agentOrchestrator: AgentOrchestrator;
  promptLoader: PromptLoader;
  logStore: InteractionLogStore;
  /** Optional STT voice adapter (required when ENABLE_VOICE=true). */
  sttProvider?: VoicePort;
  /** Optional TTS voice adapter (required when ENABLE_VOICE=true). */
  ttsProvider?: VoicePort;
}

/**
 * MessageOrchestrator — wires together the full message processing pipeline.
 *
 * Constructor accepts all adapters and managers as direct dependencies (manual DI).
 * No framework magic.
 */
export class MessageOrchestrator {
  private readonly messaging: MessagingPort;
  private readonly contextManager: ContextManager;
  private readonly rateLimiter: RateLimiter;
  private readonly sanitizer: InputSanitizer;
  private readonly auditLog: AuditLog;
  private readonly agentOrchestrator: AgentOrchestrator;
  private readonly promptLoader: PromptLoader;
  private readonly logStore: InteractionLogStore;
  private readonly sttProvider?: VoicePort;
  private readonly ttsProvider?: VoicePort;

  constructor(deps: MessageOrchestratorDeps) {
    this.messaging = deps.messaging;
    this.contextManager = deps.contextManager;
    this.rateLimiter = deps.rateLimiter;
    this.sanitizer = deps.sanitizer;
    this.auditLog = deps.auditLog;
    this.agentOrchestrator = deps.agentOrchestrator;
    this.promptLoader = deps.promptLoader;
    this.logStore = deps.logStore;
    this.sttProvider = deps.sttProvider;
    this.ttsProvider = deps.ttsProvider;
  }

  /**
   * Register this orchestrator as the message handler on the MessagingPort.
   * Call this during application startup after the HTTP server is ready.
   */
  register(): void {
    this.messaging.onMessage((message) => this.handleMessage(message));
    logger.info('MessageOrchestrator registered as message handler');
  }

  /**
   * Process a single incoming message through the full pipeline.
   *
   * Never throws — all errors are caught and a graceful message is sent.
   */
  async handleMessage(message: IncomingMessage): Promise<void> {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

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

    // Hash the phone number up-front for all downstream use
    const phoneHash = createHash('sha256').update(message.from.trim()).digest('hex');

    eventBus.emit('message.received', {
      phoneNumber: message.from,
      messageId: message.id,
      platform: message.platform,
    });

    // Track what we'll log at the end of the turn
    let userMessageForLog = message.text ?? '[voice message]';
    let agentResponse = '';
    let tokensUsed = 0;
    let terminationReason = 'error';
    let wasVoice = !!message.voice;
    const toolsInvoked: string[] = [];

    try {
      // ── 1. Rate limiting ───────────────────────────────────────────────────
      let userContext = await this.contextManager.load(message.from).catch(() => null);
      if (!userContext) {
        // Context load failure — create default context and continue
        const { createDefaultContext } = await import('../core/context/UserContext.js');
        userContext = createDefaultContext(phoneHash, {
          identity: { phoneHash, phoneNumber: message.from },
        });
        logger.warn({ phoneHash }, 'MessageOrchestrator: context load failed — using default');
      }

      const tier = userContext.guidelines.rateLimitTier;
      const rateLimitResult = this.rateLimiter.check(phoneHash, tier);

      if (!rateLimitResult.allowed) {
        logger.warn({ phoneHash, tier }, 'Rate limit hit');
        eventBus.emit('rate.limit.hit', { phoneHash, tier });
        this.auditLog.blocked('rate_limit_hit', phoneHash, { tier }, requestId);
        await this.messaging.sendText(message.from, rateLimitResult.message!);
        return;
      }

      // ── 2. Input sanitization (text messages only) ─────────────────────────
      let processedText = message.text ?? '';
      if (message.text) {
        const sanitized = this.sanitizer.sanitize(message.text);
        if (sanitized.flagged) {
          logger.warn(
            { phoneHash, reason: sanitized.flagReason },
            'Flagged message received',
          );
          this.auditLog.blocked(
            'injection_attempt',
            phoneHash,
            { reason: sanitized.flagReason },
            requestId,
          );
        }
        processedText = sanitized.sanitized;
      }

      // ── 3. Voice → Text (STT) ──────────────────────────────────────────────
      if (message.voice && message.voice.length > 0) {
        wasVoice = true;
        if (this.sttProvider) {
          try {
            const sttResult = await this.sttProvider.speechToText(message.voice, {
              language: userContext.understanding.primaryLanguage,
              hints: ['Flash', 'Bitcoin', 'satoshi', 'lightning', 'wallet', 'balance'],
            });
            processedText = sttResult.transcript;
            userMessageForLog = processedText;
            logger.info(
              { phoneHash, confidence: sttResult.confidence, transcript: processedText.slice(0, 80) },
              'STT transcription complete',
            );
          } catch (err) {
            logger.error({ phoneHash, err: String(err) }, 'STT failed — treating as text-only');
            processedText = '[Voice message could not be transcribed]';
          }
        } else {
          processedText = '[Voice message — transcription not available]';
          logger.warn({ phoneHash }, 'Voice message received but no STT provider configured');
        }
      }

      // ── 4. Dialect classification → update context ─────────────────────────
      if (processedText && !processedText.startsWith('[')) {
        const classifier = new DialectClassifier();
        const classification = classifier.classify(processedText);

        // Only update context if we detected something with meaningful confidence
        if (
          classification.dialect !== 'standard-english' &&
          classification.confidence > 0.3
        ) {
          userContext = patchContext(userContext, {
            understanding: {
              ...userContext.understanding,
              dialect: classification.dialect,
              dialectConfidence: classification.confidence,
              primaryLanguage: classification.language,
            },
          });

          logger.debug(
            { phoneHash, dialect: classification.dialect, confidence: classification.confidence },
            'Dialect detected — context updated',
          );
        }
      }

      // ── 5. Dialect normalization ───────────────────────────────────────────
      let normalizedText = processedText;
      if (processedText && userContext.understanding.dialect) {
        const normalizer = new DialectNormalizer();
        const normalized = normalizer.normalize(processedText, userContext.understanding.dialect);
        if (normalized.wasNormalized) {
          normalizedText = normalized.normalized;
          logger.debug(
            { phoneHash, substitutions: normalized.substitutions },
            'Dialect normalization applied',
          );
        }
      }

      userMessageForLog = normalizedText || processedText;

      // ── 6. Show typing indicator ───────────────────────────────────────────
      await this.messaging.sendTypingIndicator(message.from).catch(() => {});

      // ── 7. Build system prompt ─────────────────────────────────────────────
      let systemPrompt: string;
      try {
        systemPrompt = await this.promptLoader.compose(userContext);
      } catch (err) {
        logger.warn({ phoneHash, err: String(err) }, 'Prompt composition failed — using fallback');
        systemPrompt =
          'You are Pulse, a helpful financial assistant for Flash wallet users. ' +
          'Help users send money, check balances, and manage their finances.';
      }

      // ── 8. Load conversation history ───────────────────────────────────────
      const conversationHistory = await this.logStore
        .toConversationHistory(phoneHash, 6)
        .catch(() => []);

      // ── 9. Dispatch to AgentOrchestrator ───────────────────────────────────
      eventBus.emit('agent.loop.start', { phoneHash, requestId });

      const result = await this.agentOrchestrator.handle({
        message: {
          ...message,
          text: normalizedText || processedText,
        },
        userContext,
        requestId,
        systemPrompt,
        conversationHistory,
      });

      agentResponse = result.response;
      tokensUsed = result.tokensUsed;
      terminationReason = result.terminationReason;

      eventBus.emit('agent.loop.complete', {
        phoneHash,
        requestId,
        durationMs: result.durationMs,
        tokensUsed: result.tokensUsed,
      });

      // ── 10. Text → Voice (TTS) ─────────────────────────────────────────────
      const shouldSendVoice =
        result.updatedContext.understanding.prefersVoice && !!this.ttsProvider;

      if (shouldSendVoice && this.ttsProvider) {
        try {
          const ttsResult = await this.ttsProvider.textToSpeech(agentResponse, {
            language: result.updatedContext.understanding.primaryLanguage,
          });
          await this.messaging.sendVoice(message.from, ttsResult.audioBuffer);
          logger.debug({ phoneHash }, 'TTS voice reply sent');
        } catch (err) {
          logger.warn({ phoneHash, err: String(err) }, 'TTS failed — falling back to text');
          await this.messaging.sendText(message.from, agentResponse);
        }
      } else {
        // ── 11. Send text reply ──────────────────────────────────────────────
        await this.messaging.sendText(message.from, agentResponse);
      }

      eventBus.emit('message.sent', {
        phoneNumber: message.from,
        messageId: requestId,
      });

      // ── 12. Persist updated context ────────────────────────────────────────
      if (result.updatedContext) {
        await this.contextManager
          .save(message.from, result.updatedContext)
          .catch((err) => {
            logger.error(
              { phoneHash, err: String(err) },
              'MessageOrchestrator: context save failed',
            );
          });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error(
        { error: errorMessage, from: message.from, requestId },
        'MessageOrchestrator: unhandled error in pipeline',
      );

      eventBus.emit('agent.loop.error', { phoneHash, requestId, error: errorMessage });

      agentResponse = "I'm having trouble thinking right now. Please try again.";

      // Attempt to send graceful error message
      await this.messaging
        .sendText(message.from, agentResponse)
        .catch(() => {});
    } finally {
      // ── 13. Log the interaction ────────────────────────────────────────────
      const durationMs = Date.now() - startTime;
      if (userMessageForLog || agentResponse) {
        await this.logStore
          .append({
            phoneHash,
            userMessage: userMessageForLog,
            agentResponse,
            wasVoice,
            toolsInvoked,
            tokensUsed,
            terminationReason,
            durationMs,
          })
          .catch((err) => {
            logger.warn(
              { phoneHash, err: String(err) },
              'MessageOrchestrator: interaction log write failed',
            );
          });
      }
    }
  }
}
