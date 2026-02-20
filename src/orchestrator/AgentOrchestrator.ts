/**
 * AgentOrchestrator — manages AgentLoop execution and prompt construction.
 *
 * Sits between MessageOrchestrator and AgentLoop. Responsible for:
 * - Loading the appropriate system prompt
 * - Building conversation history from context
 * - Creating and running the AgentLoop
 * - Handling voice input/output transcoding
 */

import type { IncomingMessage } from '../ports/MessagingPort.js';
import type { UserContext } from '../core/context/UserContext.js';
import type { AIProviderPort } from '../ports/AIProviderPort.js';
import type { ToolRegistry } from '../core/agent/ToolRegistry.js';
import { AgentLoop } from '../core/agent/AgentLoop.js';
import { createDefaultAgentConfig } from '../core/agent/AgentConfig.js';
import { PromptLoader } from '../config/PromptLoader.js';
import { logger } from '../config/logger.js';

/** Input to AgentOrchestrator.handle() */
export interface AgentHandleInput {
  message: IncomingMessage;
  userContext: UserContext;
  requestId: string;
}

/** Output from AgentOrchestrator.handle() */
export interface AgentHandleResult {
  response: string;
  updatedContext: UserContext;
  durationMs: number;
  tokensUsed: number;
  terminationReason: string;
}

/**
 * AgentOrchestrator — creates and runs an AgentLoop for each message.
 */
export class AgentOrchestrator {
  constructor(
    private readonly aiProvider: AIProviderPort,
    private readonly toolRegistry: ToolRegistry,
    private readonly promptLoader: PromptLoader,
  ) {}

  /**
   * Handle a single incoming message through the AgentLoop.
   */
  async handle(input: AgentHandleInput): Promise<AgentHandleResult> {
    const { message, userContext, requestId } = input;

    logger.debug(
      { requestId, phoneHash: userContext.identity.phoneHash },
      'AgentOrchestrator handling message',
    );

    // Build system prompt
    const systemPrompt = await this.buildSystemPrompt(userContext);

    // Determine model tier based on user tier / message complexity
    const modelTier = this.selectModelTier(userContext, message);

    // Build agent config
    const agentConfig = createDefaultAgentConfig(userContext, {
      modelTier,
      systemPrompt,
      enableVoiceResponse: !!message.voice,
    });

    // Create and run the AgentLoop
    const loop = new AgentLoop(agentConfig, this.toolRegistry, this.aiProvider);

    const userText = message.text ?? '[Voice message]';
    const result = await loop.run(userText, [
      { role: 'system', content: systemPrompt },
    ]);

    return {
      response: result.response,
      updatedContext: result.updatedContext,
      durationMs: result.durationMs,
      tokensUsed: result.totalTokensUsed,
      terminationReason: result.terminationReason,
    };
  }

  private async buildSystemPrompt(context: UserContext): Promise<string> {
    try {
      const base = await this.promptLoader.load('system/base-agent');
      const dialect = context.understanding.dialect
        ? await this.promptLoader.load('system/dialect-awareness')
        : '';
      const capability = context.financial.isMerchant
        ? await this.promptLoader.load('capabilities/merchant-agent')
        : await this.promptLoader.load('capabilities/personal-agent');

      return [base, dialect, capability]
        .filter(Boolean)
        .join('\n\n---\n\n');
    } catch {
      return 'You are Pulse, a helpful financial assistant for Flash wallet users.';
    }
  }

  private selectModelTier(
    _context: UserContext,
    _message: IncomingMessage,
  ): 'fast' | 'balanced' | 'powerful' {
    // TODO: implement smarter routing based on message complexity
    return 'balanced';
  }
}
