/**
 * AddContact — save a new contact to the user's contact list.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class AddContact extends BaseTool {
  readonly name = 'add_contact';
  readonly description =
    "Save a new contact to the user's contact list for quick future payments. " +
    "Accepts an alias and at least one of: Flash username, phone number, or Lightning address.";
  readonly category = 'contacts' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      alias: {
        type: 'string',
        description: "Friendly name for the contact, e.g. 'Mom', 'John from work'.",
      },
      flashUsername: {
        type: 'string',
        description: "The contact's Flash username.",
      },
      phoneNumber: {
        type: 'string',
        description: "The contact's phone number in E.164 format.",
      },
      lightningAddress: {
        type: 'string',
        description: "The contact's Lightning address (user@domain).",
      },
    },
    required: ['alias'],
  };

  async execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const alias = String(params['alias'] ?? '').trim();
    const flashUsername = params['flashUsername'] ? String(params['flashUsername']) : undefined;
    const phoneNumber = params['phoneNumber'] ? String(params['phoneNumber']) : undefined;
    const lightningAddress = params['lightningAddress'] ? String(params['lightningAddress']) : undefined;

    if (!flashUsername && !phoneNumber && !lightningAddress) {
      return this.clarify(
        "To save a contact I need at least one of: Flash username, phone number, or Lightning address. What is their contact info?",
      );
    }

    const { userContext } = context;
    const existing = userContext.financial.savedContacts ?? [];

    // Avoid duplicates by alias
    if (existing.some((c) => c.alias.toLowerCase() === alias.toLowerCase())) {
      return this.fail(`You already have a contact named "${alias}". Use a different name.`);
    }

    const newContact = {
      alias,
      flashUsername,
      phoneNumber,
      lightningAddress,
    };

    context.updateContext({
      financial: {
        ...userContext.financial,
        savedContacts: [...existing, newContact],
      },
    });

    return this.complete(
      `Contact "${alias}" saved successfully!`,
      { contact: newContact },
    );
  }
}
