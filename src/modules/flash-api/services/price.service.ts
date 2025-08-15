import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlashApiService } from '../flash-api.service';
import { RedisService } from '../../redis/redis.service';

interface PriceInfo {
  btcPrice: number; // Price of 1 BTC in display currency
  currency: string;
  timestamp: Date;
  change24h?: number; // Optional: 24h price change percentage
}

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private readonly cacheTtl: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly flashApiService: FlashApiService,
    private readonly redisService: RedisService,
  ) {
    // Use configured TTL or default to 15 minutes
    this.cacheTtl = this.configService.get<number>('cache.priceTtl', 900);
    this.logger.log(`Price cache TTL set to ${this.cacheTtl} seconds`);
  }

  /**
   * Get Bitcoin price for a specific currency
   */
  async getBitcoinPrice(currency: string = 'USD', authToken?: string): Promise<PriceInfo> {
    try {
      // Try to get from cache first
      const cacheKey = `price:btc:${currency}`;
      const cachedPrice = await this.getCachedPrice(cacheKey);

      if (cachedPrice) {
        return cachedPrice;
      }

      // Not in cache, fetch from API
      const price = await this.fetchPriceFromApi(currency, authToken);

      // Store in cache
      await this.cachePrice(cacheKey, price);

      return price;
    } catch (error) {
      // Provide more specific error messages based on the error type
      if (error.message?.includes('No price data available')) {
        this.logger.error(`Flash API returned no price data for ${currency}`);
        throw new BadRequestException(
          `Price not available for ${currency}. The currency may not be supported.`,
        );
      } else if (error.message?.includes('fetch') || error.message?.includes('network')) {
        this.logger.error(`Network error fetching Bitcoin price: ${error.message}`);
        throw new BadRequestException('Network error: Unable to connect to price service');
      } else {
        this.logger.error(`Error getting Bitcoin price: ${error.message}`, error.stack);
        throw new BadRequestException('Failed to retrieve Bitcoin price');
      }
    }
  }

  /**
   * Get cached price if available
   */
  private async getCachedPrice(cacheKey: string): Promise<PriceInfo | null> {
    try {
      const cachedData = await this.redisService.get(cacheKey);

      if (!cachedData) {
        return null;
      }

      const parsed = JSON.parse(cachedData);
      // Convert timestamp string back to Date object
      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp)
      } as PriceInfo;
    } catch (error) {
      this.logger.warn(`Error getting cached price: ${error.message}`);
      return null;
    }
  }

  /**
   * Store price data in cache
   */
  private async cachePrice(cacheKey: string, price: PriceInfo): Promise<void> {
    try {
      await this.redisService.set(cacheKey, JSON.stringify(price), this.cacheTtl);
    } catch (error) {
      this.logger.warn(`Error caching price: ${error.message}`);
    }
  }

  /**
   * Fetch price data from Flash API
   */
  private async fetchPriceFromApi(currency: string, authToken?: string): Promise<PriceInfo> {
    try {
      let query: string;
      let variables: any;

      if (authToken) {
        // Use authenticated query
        query = `
          query realtimePrice {
            me {
              defaultAccount {
                realtimePrice {
                  btcSatPrice {
                    base
                    offset
                  }
                  denominatorCurrency
                  timestamp
                  usdCentPrice {
                    base
                    offset
                  }
                }
              }
            }
          }
        `;
        variables = {};
      } else {
        // Use unauthenticated query
        query = `
          query realtimePriceUnauthed($currency: DisplayCurrency!) {
            realtimePrice(currency: $currency) {
              timestamp
              btcSatPrice {
                base
                offset
              }
              usdCentPrice {
                base
                offset
              }
              denominatorCurrency
            }
          }
        `;
        variables = { currency };
      }

      const result = await this.flashApiService.executeQuery<any>(query, variables, authToken);

      // Extract realtime price based on query type
      const realtimePrice = authToken
        ? result.me?.defaultAccount?.realtimePrice
        : result.realtimePrice;

      if (!realtimePrice) {
        throw new Error('No price data available');
      }

      // Calculate BTC price from satoshi price
      // btcSatPrice gives us the price of 1 satoshi in the MINOR unit of the currency (e.g., cents for USD)
      // We need to:
      // 1. Get the price of 1 sat in minor units
      // 2. Multiply by sats per BTC to get BTC price in minor units
      // 3. Convert to major units (e.g., dollars from cents)

      const satsPerBtc = 100000000;
      const satPriceInMinorUnits =
        realtimePrice.btcSatPrice.base / Math.pow(10, realtimePrice.btcSatPrice.offset);
      const btcPriceInMinorUnits = satPriceInMinorUnits * satsPerBtc;

      // Convert from minor units to major units
      // For USD: divide by 100 (cents to dollars)
      // For other currencies, we'd need their fraction digits
      const minorUnitsPerMajorUnit = currency === 'USD' ? 100 : 100; // Default to 100 for now
      const btcPrice = btcPriceInMinorUnits / minorUnitsPerMajorUnit;

      return {
        btcPrice,
        currency: realtimePrice.denominatorCurrency || currency,
        timestamp: new Date(realtimePrice.timestamp * 1000), // Convert from Unix timestamp
      };
    } catch (error) {
      this.logger.error(`Failed to fetch price from API: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format price message for display
   */
  formatPriceMessage(priceInfo: PriceInfo): string {
    const formattedPrice = this.formatCurrencyAmount(priceInfo.btcPrice, priceInfo.currency);
    const timeAgo = this.getTimeAgo(priceInfo.timestamp);

    return `*Bitcoin Price*\n\n` + `1 BTC = ${formattedPrice}\n\n` + `Last updated: ${timeAgo}`;
  }

  /**
   * Format currency amount with appropriate symbol
   */
  private formatCurrencyAmount(amount: number, currency: string): string {
    const currencyFormatters: Record<string, (n: number) => string> = {
      USD: (n) =>
        `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      EUR: (n) =>
        `€${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      JMD: (n) =>
        `J$${n.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      // Add more currencies as needed
    };

    const formatter =
      currencyFormatters[currency] ||
      ((n) =>
        `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    return formatter(amount);
  }

  /**
   * Get human-readable time ago string
   */
  private getTimeAgo(timestamp: Date): string {
    const now = Date.now();
    const diffMs = now - timestamp.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) {
      return 'just now';
    } else if (diffSecs < 3600) {
      const mins = Math.floor(diffSecs / 60);
      return `${mins} minute${mins > 1 ? 's' : ''} ago`;
    } else {
      const hours = Math.floor(diffSecs / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
  }
}
