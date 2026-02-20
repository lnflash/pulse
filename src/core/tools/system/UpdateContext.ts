/**
 * UpdateContext — update the user's context with new information.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class UpdateContext extends BaseTool {
  readonly name = 'update_context';
  readonly description =
    "Update the user's profile with newly learned information. " +
    "Use this when you learn the user's preferred language, currency, name, or other preferences. " +
    "Only update fields you've explicitly confirmed with the user.";
  readonly category = 'system' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      preferredCurrency: {
        type: 'string',
        description: "User's preferred display currency, e.g. 'JMD', 'USD'.",
      },
      dialect: {
        type: 'string',
        description: "Detected dialect, e.g. 'jamaican-patois', 'trinidadian-creole', 'standard-en'.",
      },
      displayName: {
        type: 'string',
        description: "User's preferred name.",
      },
      prefersVoice: {
        type: 'boolean',
        description: 'Whether the user prefers voice responses.',
      },
      timezone: {
        type: 'string',
        description: "User's timezone, e.g. 'America/Jamaica'.",
      },
    },
    required: [],
  };

  async execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const { userContext } = context;
    const updates: string[] = [];

    if (params['preferredCurrency']) {
      context.updateContext({
        understanding: {
          ...userContext.understanding,
          preferredCurrency: String(params['preferredCurrency']),
        },
      });
      updates.push(`preferred currency → ${params['preferredCurrency']}`);
    }

    if (params['dialect']) {
      context.updateContext({
        understanding: {
          ...userContext.understanding,
          dialect: String(params['dialect']),
        },
      });
      updates.push(`dialect → ${params['dialect']}`);
    }

    if (params['displayName']) {
      context.updateContext({
        identity: {
          ...userContext.identity,
          displayName: String(params['displayName']),
        },
      });
      updates.push(`display name → ${params['displayName']}`);
    }

    if (typeof params['prefersVoice'] === 'boolean') {
      context.updateContext({
        understanding: {
          ...userContext.understanding,
          prefersVoice: params['prefersVoice'],
        },
      });
      updates.push(`prefers voice → ${params['prefersVoice']}`);
    }

    if (params['timezone']) {
      context.updateContext({
        identity: {
          ...userContext.identity,
          timezone: String(params['timezone']),
        },
      });
      updates.push(`timezone → ${params['timezone']}`);
    }

    if (updates.length === 0) {
      return this.success('No context updates applied — no recognized fields provided.');
    }

    return this.success(`Context updated: ${updates.join(', ')}`);
  }
}
