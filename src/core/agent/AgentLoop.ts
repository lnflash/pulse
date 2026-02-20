/**
 * AgentLoop — the main AI agent execution loop for Pulse v5.
 *
 * Implements the tool-calling loop:
 *   1. Send message history + available tools to AI model
 *   2. If model returns tool calls → execute them, append results, repeat
 *   3. If model returns a text response → return it to the caller
 *   4. Respect CompletionSignals from tools (complete/clarify/escalate)
 *   5. Enforce maxIterations and timeoutMs limits
 */

import type { AgentConfig } from './AgentConfig.js';
import { isTerminalSignal, requiresUserInput } from './CompletionSignal.js';
import type { ToolRegistry } from './ToolRegistry.js';
import type { AIProviderPort, AIMessage } from '../../ports/AIProviderPort.js';
import type { UserContext } from '../context/UserContext.js';
import { patchContext } from '../context/UserContext.js';
import { logger } from '../../config/logger.js';

/** The final output of an AgentLoop execution. */
export interface AgentLoopResult {
  /** The agent's final response to send to the user. */
  response: string;
  /**
   * Signal indicating why the loop terminated:
   * - 'complete' — conversation turn fully resolved
   * - 'clarify'  — agent is asking the user for more info
   * - 'escalate' — handed off to a human agent
   * - 'timeout'  — loop hit the time limit
   * - 'max_iterations' — loop hit the iteration limit
   * - 'error'    — unexpected failure
   */
  terminationReason:
    | 'complete'
    | 'clarify'
    | 'escalate'
    | 'timeout'
    | 'max_iterations'
    | 'error';
  /** Total tokens consumed across all AI calls in this loop. */
  totalTokensUsed: number;
  /** Number of AI model calls made. */
  aiCallCount: number;
  /** Number of tool invocations. */
  toolCallCount: number;
  /**
   * Updated user context after all tool executions.
   * The orchestrator must persist this after the loop completes.
   */
  updatedContext: UserContext;
  /** Duration of the loop execution in milliseconds. */
  durationMs: number;
}

/**
 * AgentLoop — orchestrates the AI ↔ tool ↔ AI call cycle.
 *
 * One AgentLoop instance handles one user message turn.
 * Create a new instance per message (not a singleton).
 */
export class AgentLoop {
  private readonly config: AgentConfig;
  private readonly toolRegistry: ToolRegistry;
  private readonly aiProvider: AIProviderPort;

  constructor(
    config: AgentConfig,
    toolRegistry: ToolRegistry,
    aiProvider: AIProviderPort,
  ) {
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.aiProvider = aiProvider;
  }

  /**
   * Run the agent loop for a single user message.
   *
   * @param userMessage The user's raw message text.
   * @param conversationHistory Previous conversation messages (system + past turns).
   * @returns The agent's response and loop metadata.
   */
  async run(
    userMessage: string,
    conversationHistory: AIMessage[] = [],
  ): Promise<AgentLoopResult> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const { config } = this;
    let currentContext = config.userContext;
    let totalTokens = 0;
    let aiCallCount = 0;
    let toolCallCount = 0;

    // Build initial message history
    const messages: AIMessage[] = [
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    // Get tools available to this user
    const availableTools = this.toolRegistry.getToolsForUser(currentContext);
    const toolDefinitions = this.toolRegistry.toToolDefinitions(availableTools);

    logger.info(
      {
        requestId,
        phoneHash: currentContext.identity.phoneHash,
        toolCount: availableTools.length,
        modelTier: config.modelTier,
      },
      'AgentLoop starting',
    );

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      logger.warn({ requestId }, 'AgentLoop timeout');
    }, config.timeoutMs);

    try {
      for (let iteration = 0; iteration < config.maxIterations; iteration++) {
        // Check timeout
        if (Date.now() - startTime >= config.timeoutMs) {
          logger.warn({ requestId, iteration }, 'AgentLoop hit timeout');
          return this.buildResult(
            "I'm taking too long to process your request. Please try again in a moment.",
            'timeout',
            totalTokens,
            aiCallCount,
            toolCallCount,
            currentContext,
            startTime,
          );
        }

        logger.debug({ requestId, iteration }, 'AgentLoop iteration');

        // Call the AI model
        const aiResponse = await this.aiProvider.chat(messages, toolDefinitions, {
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          systemPrompt: config.systemPrompt,
        });

        aiCallCount++;
        totalTokens += aiResponse.usage.totalTokens;

        // If no tool calls, the AI has a final response
        if (!aiResponse.toolCalls || aiResponse.toolCalls.length === 0) {
          logger.info(
            { requestId, iteration, aiCallCount, toolCallCount, totalTokens },
            'AgentLoop complete — final AI response',
          );
          return this.buildResult(
            aiResponse.content,
            'complete',
            totalTokens,
            aiCallCount,
            toolCallCount,
            currentContext,
            startTime,
          );
        }

        // Append assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: aiResponse.content,
          toolCalls: aiResponse.toolCalls,
        });

        // Execute each tool call
        let shouldTerminate = false;
        let terminationReason: AgentLoopResult['terminationReason'] = 'complete';

        for (const toolCall of aiResponse.toolCalls) {
          toolCallCount++;

          // Build execution context with context-mutation callback
          let contextPatch: Partial<UserContext> = {};
          const execContext = {
            userContext: currentContext,
            updateContext: (patch: Partial<UserContext>) => {
              contextPatch = { ...contextPatch, ...patch };
            },
            requestId,
          };

          const toolResult = await this.toolRegistry.execute(
            toolCall.name,
            toolCall.arguments,
            execContext,
          );

          // Apply any context mutations from the tool
          if (Object.keys(contextPatch).length > 0) {
            currentContext = patchContext(currentContext, contextPatch);
          }

          // Append tool result to messages
          messages.push({
            role: 'tool',
            content: toolResult.output,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          });

          // Check the completion signal
          if (requiresUserInput(toolResult.signal)) {
            shouldTerminate = true;
            terminationReason = toolResult.signal as 'clarify' | 'escalate';
          } else if (isTerminalSignal(toolResult.signal) && toolResult.signal !== 'continue') {
            shouldTerminate = true;
            terminationReason = toolResult.signal as 'complete';
          }
        }

        // If a tool signaled termination, do one more AI call for final response
        if (shouldTerminate) {
          const finalResponse = await this.aiProvider.chat(messages, [], {
            maxTokens: config.maxTokens,
            temperature: config.temperature,
          });
          aiCallCount++;
          totalTokens += finalResponse.usage.totalTokens;

          return this.buildResult(
            finalResponse.content,
            terminationReason,
            totalTokens,
            aiCallCount,
            toolCallCount,
            currentContext,
            startTime,
          );
        }
      }

      // Hit max iterations
      logger.warn({ requestId, maxIterations: config.maxIterations }, 'AgentLoop hit max iterations');
      return this.buildResult(
        "I've been working on your request but need to pause. Could you rephrase or try again?",
        'max_iterations',
        totalTokens,
        aiCallCount,
        toolCallCount,
        currentContext,
        startTime,
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ requestId, error }, 'AgentLoop unexpected error');
      return this.buildResult(
        "I encountered an unexpected error. Please try again.",
        'error',
        totalTokens,
        aiCallCount,
        toolCallCount,
        currentContext,
        startTime,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private buildResult(
    response: string,
    terminationReason: AgentLoopResult['terminationReason'],
    totalTokensUsed: number,
    aiCallCount: number,
    toolCallCount: number,
    updatedContext: UserContext,
    startTime: number,
  ): AgentLoopResult {
    return {
      response,
      terminationReason,
      totalTokensUsed,
      aiCallCount,
      toolCallCount,
      updatedContext,
      durationMs: Date.now() - startTime,
    };
  }
}
