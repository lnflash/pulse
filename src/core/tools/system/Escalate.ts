/**
 * Escalate — hand off the conversation to a human agent.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class Escalate extends BaseTool {
  readonly name = 'escalate';
  readonly description =
    "Escalate the conversation to a human support agent. " +
    "Use this for: fraud suspicion, severe distress, complex disputes, regulatory questions, " +
    "or any situation you cannot confidently resolve. " +
    "Always prefer this over giving incorrect information about financial matters.";
  readonly category = 'system' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Brief reason for escalation (for the support agent, not shown to user).',
      },
      summary: {
        type: 'string',
        description: 'Summary of the conversation context for the support agent.',
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: 'Escalation priority. Use "urgent" for fraud or immediate financial harm.',
      },
    },
    required: ['reason'],
  };

  async execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const priority = String(params['priority'] ?? 'normal');

    // Mark session as escalated
    context.updateContext({
      session: {
        ...context.userContext.session,
        escalated: true,
      },
    });

    const userMessage =
      priority === 'urgent'
        ? "I'm connecting you with a support agent right away. Please stand by."
        : "I've flagged your request for our support team. They'll reach out to you shortly.";

    return this.escalate(userMessage);
  }
}
