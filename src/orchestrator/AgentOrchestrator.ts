/**
 * AgentOrchestrator — manages AgentLoop execution for a single message turn.
 *
 * Sits between MessageOrchestrator and AgentLoop. Responsible for:
 * - Accepting the pre-built system prompt and conversation history
 * - Creating and running the AgentLoop
 * - Handling errors gracefully — returning user-friendly messages
 */

import type { IncomingMessage } from '../ports/MessagingPort.js';
import type { UserContext } from '../core/context/UserContext.js';
import type { AIProviderPort, AIMessage } from '../ports/AIProviderPort.js';
import type { ToolRegistry } from '../core/agent/ToolRegistry.js';
import { AgentLoop } from '../core/agent/AgentLoop.js';
import { createDefaultAgentConfig } from '../core/agent/AgentConfig.js';
import { logger } from '../config/logger.js';

/** Input to AgentOrchestrator.handle() */
export interface AgentHandleInput {
  /** The (possibly STT-transcribed, dialect-normalized) incoming message. */
  message: IncomingMessage;
  /** Hydrated user context from ContextManager. */
  userContext: UserContext;
  /** Unique request ID for tracing. */
  requestId: string;
  /**
   * Pre-built system prompt from MessageOrchestrator (PromptLoader.compose()).
   * Falls back to a built-in default if omitted.
   */
  systemPrompt?: string;
  /**
   * Recent conversation history for multi-turn context.
   * Loaded from InteractionLogStore by MessageOrchestrator.
   * Oldest messages first.
   */
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/** Output from AgentOrchestrator.handle() */
export interface AgentHandleResult {
  /** The agent's final reply to the user. */
  response: string;
  /** Updated user context — caller must persist this. */
  updatedContext: UserContext;
  /** Total duration of the turn in milliseconds. */
  durationMs: number;
  /** Total tokens consumed across all AI calls. */
  tokensUsed: number;
  /** Why the agent loop ended. */
  terminationReason: string;
}

/**
 * AgentOrchestrator — creates and runs an AgentLoop for each message turn.
 *
 * One instance is shared across all requests (stateless between turns).
 */
export class AgentOrchestrator {
  constructor(
    private readonly aiProvider: AIProviderPort,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  /**
   * Handle a single incoming message through the AgentLoop.
   *
   * Never throws — all AI/tool errors are caught and a user-friendly message
   * is returned.
   */
  async handle(input: AgentHandleInput): Promise<AgentHandleResult> {
    const { message, userContext, requestId, systemPrompt, conversationHistory = [] } = input;
    const startTime = Date.now();

    logger.debug(
      {
        requestId,
        phoneHash: userContext.identity.phoneHash,
        historyTurns: conversationHistory.length / 2,
        hasSystemPrompt: !!systemPrompt,
      },
      'AgentOrchestrator: handling message',
    );

    try {
      // ── Build agent config ─────────────────────────────────────────────────
      const modelTier = this.selectModelTier(userContext, message);

      const agentConfig = createDefaultAgentConfig(userContext, {
        modelTier,
        systemPrompt: systemPrompt ?? this.fallbackSystemPrompt(),
        enableVoiceResponse: !!message.voice,
      });

      // ── Build full conversation history for AgentLoop ──────────────────────
      // Convert the stored history (user/assistant pairs) into AIMessage format.
      // The system prompt is passed separately via agentConfig, not as a message.
      const historyMessages: AIMessage[] = conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // ── Create and run the AgentLoop ───────────────────────────────────────
      const loop = new AgentLoop(agentConfig, this.toolRegistry, this.aiProvider);

      const userText = message.text ?? '[Voice message]';

      let result;
      try {
        result = await loop.run(userText, historyMessages);
      } catch (aiErr) {
        const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        logger.error({ requestId, error: errMsg }, 'AgentLoop threw unexpectedly');

        // Return user-friendly error; keep original context unchanged
        return {
          response: "I'm having trouble thinking right now. Please try again.",
          updatedContext: userContext,
          durationMs: Date.now() - startTime,
          tokensUsed: 0,
          terminationReason: 'error',
        };
      }

      return {
        response: result.response,
        updatedContext: result.updatedContext,
        durationMs: result.durationMs,
        tokensUsed: result.totalTokensUsed,
        terminationReason: result.terminationReason,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { requestId, error: errorMessage },
        'AgentOrchestrator: unexpected error — returning graceful message',
      );

      return {
        response: "I'm having trouble thinking right now. Please try again.",
        updatedContext: userContext,
        durationMs: Date.now() - startTime,
        tokensUsed: 0,
        terminationReason: 'error',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Select AI model tier based on user context and message characteristics.
   *
   * Rules:
   * - Merchants or high-KYC users get the balanced tier by default
   * - Could be extended to route complex queries to 'powerful'
   * - Falls back to 'balanced' for all standard users
   */
  private selectModelTier(
    context: UserContext,
    _message: IncomingMessage,
  ): 'fast' | 'balanced' | 'powerful' {
    // High-stakes users get balanced (more capable) model
    if (context.financial.isMerchant || context.identity.kycTier >= 2) {
      return 'balanced';
    }
    // Standard users get the fast tier by default (cost efficiency)
    return 'fast';
  }

  /** Fallback system prompt used when PromptLoader is unavailable. */
  private fallbackSystemPrompt(): string {
    return (
      'You are Pulse, a helpful financial assistant for Flash wallet users in the Caribbean. ' +
      'Help users send money, check balances, create invoices, and manage their Flash wallets. ' +
      'Be concise, friendly, and clear. Understand Caribbean English dialects. ' +
      'Always confirm before executing financial transactions.'
    );
  }
}
