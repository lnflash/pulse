/**
 * GetServiceStatus — check the operational status of Flash services.
 * Stub — full implementation in a later sprint.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class GetServiceStatus extends BaseTool {
  readonly name = 'get_service_status';
  readonly description =
    'Check whether Flash payment services are operational. ' +
    'Use this when a user reports payment failures or unexpected errors.';
  readonly category = 'discovery' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      service: {
        type: 'string',
        enum: ['payments', 'kyc', 'exchange', 'all'],
        description: 'Which service to check. Default: all.',
      },
    },
    required: [],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('Not implemented: GetServiceStatus — discovery tools planned for Week 9.');
  }
}
