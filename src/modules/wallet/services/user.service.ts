import { Injectable, Logger } from '@nestjs/common';
import { FlashApiClient } from '../flash-api.client';
import { ACCOUNT_DEFAULT_WALLET_QUERY } from '../graphql/queries';

const ME_QUERY = `
  query me {
    me {
      id
      phone
      username
    }
  }
`;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly client: FlashApiClient) {}

  async getUserDetails(
    authToken: string,
  ): Promise<{ id: string; phone: string; username?: string }> {
    const result = await this.client.execute<{
      me: { id: string; phone: string; username?: string };
    }>(ME_QUERY, {}, authToken);
    return result.me;
  }

  async resolveWalletIdByUsername(username: string, authToken?: string): Promise<string> {
    const result = await this.client.execute<{
      accountDefaultWallet: { id: string };
    }>(ACCOUNT_DEFAULT_WALLET_QUERY, { username }, authToken);
    return result.accountDefaultWallet.id;
  }
}
