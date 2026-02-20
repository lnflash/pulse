/**
 * LinkAccount — initiate the Flash account linking flow.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class LinkAccount extends BaseTool {
  readonly name = 'link_account';
  readonly description =
    'Start the process of linking this WhatsApp number to a Flash account. ' +
    'Sends an OTP to the phone number for verification. ' +
    "Call this when the user wants to connect their Flash wallet or hasn't linked yet.";
  readonly category = 'identity' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      phoneNumber: {
        type: 'string',
        description: "The user's phone number in E.164 format, e.g. +18765551234. Usually taken from the WhatsApp message sender.",
      },
    },
    required: ['phoneNumber'],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('Identity service not injected. LinkAccount requires an identity adapter.');
  }
}
