import { Injectable, Logger } from '@nestjs/common';
import { FlashApiClient } from '../flash-api.client';

export interface BalanceInfo {
  btcBalance: number;
  fiatBalance: number;
  fiatCurrency: string;
  lastUpdated: Date;
  exchangeRate?: {
    usdCentPrice: { base: number; offset: number };
  };
}

const BALANCE_QUERY = `
  query me {
    me {
      defaultAccount {
        displayCurrency
        realtimePrice {
          btcSatPrice { base, offset }
          usdCentPrice { base, offset }
        }
        wallets { id, balance, walletCurrency }
      }
    }
  }
`;

interface BalanceCacheEntry {
  data: BalanceInfo;
  expiresAt: number;
}

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);
  private readonly cache = new Map<string, BalanceCacheEntry>();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  constructor(private readonly client: FlashApiClient) {}

  async getBalance(authToken: string, userId: string): Promise<BalanceInfo> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const result = await this.client.execute<{
      me: {
        defaultAccount: {
          displayCurrency: string;
          realtimePrice: {
            btcSatPrice: { base: number; offset: number };
            usdCentPrice: { base: number; offset: number };
          };
          wallets: Array<{ id: string; balance: number; walletCurrency: string }>;
        };
      };
    }>(BALANCE_QUERY, {}, authToken);

    const account = result.me.defaultAccount;
    const btcWallet = account.wallets.find((w) => w.walletCurrency === 'BTC');
    const usdWallet = account.wallets.find((w) => w.walletCurrency === 'USD');

    const balance: BalanceInfo = {
      btcBalance: btcWallet?.balance || 0,
      fiatBalance: (usdWallet?.balance || 0) / 100,
      fiatCurrency: account.displayCurrency || 'USD',
      lastUpdated: new Date(),
      exchangeRate:
        account.displayCurrency !== 'USD'
          ? { usdCentPrice: account.realtimePrice.usdCentPrice }
          : undefined,
    };

    this.cache.set(userId, { data: balance, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return balance;
  }

  clearCache(userId: string): void {
    this.cache.delete(userId);
  }
}
