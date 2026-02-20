/**
 * RemoveContact — remove a contact from the user's contact list.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class RemoveContact extends BaseTool {
  readonly name = 'remove_contact';
  readonly description =
    "Remove a saved contact from the user's contact list. " +
    "Matches by alias name (case-insensitive).";
  readonly category = 'contacts' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      alias: {
        type: 'string',
        description: "The alias/name of the contact to remove.",
      },
    },
    required: ['alias'],
  };

  async execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const alias = String(params['alias'] ?? '').trim().toLowerCase();
    const { userContext } = context;
    const existing = userContext.financial.savedContacts ?? [];

    const idx = existing.findIndex((c) => c.alias.toLowerCase() === alias);
    if (idx === -1) {
      return this.fail(`No contact found with name "${params['alias']}".`);
    }

    const removed = existing[idx];
    const updated = [...existing.slice(0, idx), ...existing.slice(idx + 1)];

    context.updateContext({
      financial: { ...userContext.financial, savedContacts: updated },
    });

    return this.complete(`Contact "${removed!.alias}" removed.`, { removed });
  }
}
