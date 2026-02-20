/**
 * Clarify — signal that the agent needs more information from the user.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class Clarify extends BaseTool {
  readonly name = 'clarify';
  readonly description =
    "Signal that you need more information from the user to proceed. " +
    "Use this when the user's request is ambiguous or missing required details. " +
    "Provide a specific, helpful question in the 'question' parameter.";
  readonly category = 'system' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The specific question to ask the user. Be concise and clear.',
      },
      context: {
        type: 'string',
        description: 'Optional brief context explaining why you need this information.',
      },
    },
    required: ['question'],
  };

  async execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const question = String(params['question'] ?? '');
    const ctx = params['context'] ? ` (${params['context']})` : '';

    // Track confused turns
    context.updateContext({
      session: {
        ...context.userContext.session,
        confusedTurns: (context.userContext.session.confusedTurns ?? 0) + 1,
      },
    });

    return this.clarify(question + ctx);
  }
}
