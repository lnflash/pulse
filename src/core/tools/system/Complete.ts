/**
 * Complete — signal that the agent has fully resolved the user's request.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class Complete extends BaseTool {
  readonly name = 'complete';
  readonly description =
    "Signal that you have fully answered the user's request and the conversation turn is done. " +
    "Use this to explicitly close the loop and provide a final response. " +
    "Include the final message to send to the user in the 'message' parameter.";
  readonly category = 'system' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The final message to send to the user.',
      },
    },
    required: ['message'],
  };

  async execute(
    params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const message = String(params['message'] ?? '');
    return this.complete(message);
  }
}
