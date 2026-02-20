/**
 * LocateAgent — discover available Pulse agents for cross-corridor routing.
 * Stub — full implementation in a later sprint.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class LocateAgent extends BaseTool {
  readonly name = 'locate_agent';
  readonly description =
    'Find a Pulse agent that can handle a request for a specific country or corridor. ' +
    'Used for cross-border payment routing and multi-agent coordination.';
  readonly category = 'discovery' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      countryCode: {
        type: 'string',
        description: "ISO 3166-1 alpha-2 country code, e.g. 'JM', 'TT', 'US'.",
      },
      capability: {
        type: 'string',
        description: "Specific capability needed, e.g. 'send_payment', 'kyc', 'merchant'.",
      },
    },
    required: ['countryCode'],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('Not implemented: LocateAgent — discovery tools planned for Week 9.');
  }
}
