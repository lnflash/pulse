import { Injectable, Logger } from '@nestjs/common';
import { FlashApiClient } from '../flash-api.client';

export interface PriceInfo {
  btcPrice: number;
  currency: string;
  timestamp: Date;
}

const REALTIME_PRICE_AUTHED = `
  query realtimePrice {
    me {
      defaultAccount {
        realtimePrice {
          btcSatPrice { base, offset }
          usdCentPrice { base, offset }
          denominatorCurrency
          timestamp
        }
      }
    }
  }
`;

const REALTIME_PRICE_UNAUTHED = `
  query realtimePriceUnauthed($currency: DisplayCurrency!) {
    realtimePrice(currency: $currency) {
      timestamp
      btcSatPrice { base, offset }
      usdCentPrice { base, offset }
      denominatorCurrency
    }
  }
`;

interface PriceCacheEntry {
  data: PriceInfo;
  expiresAt: number;
}

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private readonly cache = new Map<string, PriceCacheEntry>();
  private readonly CACHE_TTL_MS = 900_000; // 15 minutes

  constructor(private readonly client: FlashApiClient) {}

  async getPrice(currency: string = 'USD', authToken?: string): Promise<PriceInfo> {
    const cacheKey = `price:${currency}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    let realtimePrice: any;

    if (authToken) {
      const result = await this.client.execute<any>(REALTIME_PRICE_AUTHED, {}, authToken);
      realtimePrice = result.me?.defaultAccount?.realtimePrice;
    } else {
      const result = await this.client.execute<any>(REALTIME_PRICE_UNAUTHED, { currency });
      realtimePrice = result.realtimePrice;
    }

    if (!realtimePrice) throw new Error('No price data available');

    const satsPerBtc = 100_000_000;
    const satPriceMinor =
      realtimePrice.btcSatPrice.base / Math.pow(10, realtimePrice.btcSatPrice.offset);
    const btcPrice = (satPriceMinor * satsPerBtc) / 100;

    const price: PriceInfo = {
      btcPrice,
      currency: realtimePrice.denominatorCurrency || currency,
      timestamp: new Date(realtimePrice.timestamp * 1000),
    };

    this.cache.set(cacheKey, { data: price, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return price;
  }
}
