/**
 * ListContacts — list the user's saved payment contacts.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class ListContacts extends BaseTool {
  readonly name = 'list_contacts';
  readonly description =
    "Return the user's saved contacts list. " +
    "Each contact has an alias, destination (Flash username, phone, or Lightning address), " +
    "and optional last-paid date.";
  readonly category = 'contacts' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {},
    required: [],
  };

  async execute(
    _params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const contacts = context.userContext.financial.savedContacts ?? [];

    if (contacts.length === 0) {
      return this.success("You don't have any saved contacts yet.", { contacts: [] });
    }

    const list = contacts
      .map((c) => {
        const dest = c.lightningAddress ?? c.flashUsername ?? c.phoneNumber ?? 'unknown';
        return `• ${c.alias} → ${dest}`;
      })
      .join('\n');

    return this.complete(
      `Your saved contacts (${contacts.length}):\n${list}`,
      { contacts },
    );
  }
}
