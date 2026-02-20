/**
 * VerifyOTP — verify the OTP sent during account linking.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../Tool.js';

/** Minimal shape of the OTP validation response. */
interface OtpValidateResponse {
  data?: {
    userPhoneRegistrationValidate?: {
      authToken?: string | null;
      totpRequired?: boolean;
      errors?: Array<{ message: string; code?: string }>;
    };
  };
  errors?: Array<{ message: string }>;
}

/** Minimal shape of the `me` query response. */
interface MeResponse {
  data?: {
    me?: {
      id: string;
      username?: string | null;
      defaultAccount?: {
        id: string;
        defaultWalletId: string;
        wallets?: Array<{ id: string; walletCurrency: string }>;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

const FLASH_API_URL = process.env['FLASH_API_URL'] ?? 'https://api.flashapp.me';
const FLASH_API_TIMEOUT_MS = Number(process.env['FLASH_API_TIMEOUT_MS'] ?? 10_000);

const VALIDATE_MUTATION = `
  mutation userPhoneRegistrationValidate($input: UserPhoneRegistrationValidateInput!) {
    userPhoneRegistrationValidate(input: $input) {
      authToken
      totpRequired
      errors {
        message
        code
      }
    }
  }
`;

const ME_QUERY = `
  query me {
    me {
      id
      username
      defaultAccount {
        id
        defaultWalletId
        wallets {
          id
          walletCurrency
        }
      }
    }
  }
`;

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
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const otp = String(params['otp'] ?? '').trim();
    const paramPhone = String(params['phoneNumber'] ?? '').trim();
    // Fall back to the phone stored in the user's identity context
    const phone = paramPhone || context.userContext.identity.phoneNumber;

    if (!otp) {
      return this.clarify('Please provide the 6-digit code you received via SMS.');
    }
    if (!phone) {
      return this.clarify('I need your phone number to verify the code. What is it?');
    }

    // ── Step 1: Validate OTP ─────────────────────────────────────────────────
    let authToken: string;
    try {
      const validateResponse = await fetch(`${FLASH_API_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: VALIDATE_MUTATION,
          variables: { input: { phone, code: otp } },
        }),
        signal: AbortSignal.timeout(FLASH_API_TIMEOUT_MS),
      });

      if (!validateResponse.ok) {
        return this.fail(
          `OTP verification failed: server returned HTTP ${validateResponse.status}. Please try again.`,
        );
      }

      const json = (await validateResponse.json()) as OtpValidateResponse;

      // Top-level GraphQL errors (network/schema issues)
      if (json.errors?.length) {
        const msg = json.errors.map((e) => e.message).join(', ');
        return this.fail(`Verification failed: ${msg}`);
      }

      const result = json.data?.userPhoneRegistrationValidate;

      // Business-logic errors (wrong code, expired, etc.)
      if (result?.errors?.length) {
        const msg = result.errors.map((e) => e.message).join(', ');
        return this.fail(
          `Incorrect or expired code. ${msg} — Please request a new code and try again.`,
        );
      }

      const token = result?.authToken;
      if (!token) {
        return this.fail(
          'Verification did not return an auth token. The code may have expired — please request a new one.',
        );
      }
      authToken = token;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fail(`Failed to verify OTP: ${message}`);
    }

    // ── Step 2: Fetch account info with the new auth token ───────────────────
    try {
      const meResponse = await fetch(`${FLASH_API_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ query: ME_QUERY }),
        signal: AbortSignal.timeout(FLASH_API_TIMEOUT_MS),
      });

      if (!meResponse.ok) {
        // OTP was valid, but fetching account details failed — still mark as linked
        context.updateContext({
          identity: {
            ...context.userContext.identity,
            accountLinked: true,
            phoneNumber: phone,
          },
        });
        return this.complete(
          '✅ Your Flash account has been linked successfully! ' +
            'Welcome to Pulse — you can now use all wallet features.',
          { linked: true },
        );
      }

      const meJson = (await meResponse.json()) as MeResponse;
      const me = meJson.data?.me;
      const defaultAccount = me?.defaultAccount ?? null;

      context.updateContext({
        identity: {
          ...context.userContext.identity,
          accountLinked: true,
          phoneNumber: phone,
          flashUsername: me?.username ?? undefined,
          flashAccountId: defaultAccount?.id ?? undefined,
        },
      });

      const handle = me?.username ? `@${me.username}` : 'your account';
      return this.complete(
        `✅ Successfully linked ${handle} to Pulse! ` +
          `Your wallet is ready. Type "balance" to check your current balance.`,
        {
          linked: true,
          username: me?.username ?? null,
          accountId: defaultAccount?.id ?? null,
          defaultWalletId: defaultAccount?.defaultWalletId ?? null,
        },
      );
    } catch {
      // Auth succeeded but account-info fetch failed — still link the account
      context.updateContext({
        identity: {
          ...context.userContext.identity,
          accountLinked: true,
          phoneNumber: phone,
        },
      });
      return this.complete(
        '✅ Your Flash account has been linked! You can now use all wallet features.',
        { linked: true },
      );
    }
  }
}
