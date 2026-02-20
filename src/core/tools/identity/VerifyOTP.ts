/**
 * VerifyOTP — verify the OTP sent during account linking.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

export class VerifyOTP extends BaseTool {
  readonly name = 'verify_otp';
  readonly description =
    'Verify the one-time password (OTP) that was sent to the user during account linking. ' +
    'On success, the Flash account will be linked and wallet features unlocked.';
  readonly category = 'identity' as const;
  readonly requiresAuth = false;
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: 'object',
    properties: {
      otp: {
        type: 'string',
        description: 'The 6-digit OTP code the user received via SMS.',
      },
      phoneNumber: {
        type: 'string',
        description: "The user's phone number in E.164 format.",
      },
    },
    required: ['otp', 'phoneNumber'],
  };

  async execute(
    _params: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    throw new Error('Identity service not injected. VerifyOTP requires an identity adapter.');
  }
}
