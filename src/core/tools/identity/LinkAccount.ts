/**
 * LinkAccount — initiate the Flash account linking flow.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

/** Minimal shape of the Flash OTP initiation response. */
interface OtpInitiateResponse {
  data?: {
    userPhoneRegistrationInitiate?: {
      success: boolean;
      errors?: Array<{ message: string; code?: string }>;
    };
  };
  errors?: Array<{ message: string }>;
}

const FLASH_API_URL = process.env['FLASH_API_URL'] ?? 'https://api.flashapp.me';
const FLASH_API_TIMEOUT_MS = Number(process.env['FLASH_API_TIMEOUT_MS'] ?? 10_000);

const INITIATE_MUTATION = `
  mutation userPhoneRegistrationInitiate($input: UserPhoneRegistrationInitiateInput!) {
    userPhoneRegistrationInitiate(input: $input) {
      success
      errors {
        message
        code
      }
    }
  }
`;

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
        description:
          "The user's phone number in E.164 format, e.g. +18765551234. Usually taken from the WhatsApp message sender.",
      },
    },
    required: ['phoneNumber'],
  };

  async execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    // Resolve phone: from params or fall back to identity context
    const paramPhone = String(params['phoneNumber'] ?? '').trim();
    const phone = paramPhone || context.userContext.identity.phoneNumber;

    if (!phone) {
      return this.clarify(
        'I need your phone number to send the verification code. What is it? (e.g. +18765551234)',
      );
    }

    try {
      const response = await fetch(`${FLASH_API_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: INITIATE_MUTATION,
          variables: { input: { phone, channel: 'SMS' } },
        }),
        signal: AbortSignal.timeout(FLASH_API_TIMEOUT_MS),
      });

      if (!response.ok) {
        return this.fail(
          `Failed to send verification code: server returned HTTP ${response.status}. Please try again.`,
        );
      }

      const json = (await response.json()) as OtpInitiateResponse;

      // Top-level GraphQL errors
      if (json.errors?.length) {
        const msg = json.errors.map((e) => e.message).join(', ');
        return this.fail(`Failed to send verification code: ${msg}`);
      }

      const result = json.data?.userPhoneRegistrationInitiate;
      if (!result?.success) {
        const errMsg =
          result?.errors?.map((e) => e.message).join(', ') ?? 'Unknown error from Flash API';
        return this.fail(`Could not send verification code: ${errMsg}`);
      }

      return this.success(
        `📱 A verification code has been sent to ${phone} via SMS. ` +
          `Please reply with the 6-digit code to finish linking your Flash account.`,
        { phone },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fail(`Failed to initiate account linking: ${message}`);
    }
  }
}
