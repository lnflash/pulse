import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
}

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(private readonly redisService: RedisService) {}

  async getFeatureFlag(name: string): Promise<boolean> {
    const key = `feature:${name}`;
    const value = await this.redisService.get(key);
    return value === 'true';
  }

  async setFeatureFlag(name: string, enabled: boolean): Promise<void> {
    const key = `feature:${name}`;
    await this.redisService.set(key, enabled ? 'true' : 'false');
    this.logger.log(`Feature flag '${name}' set to ${enabled}`);
  }

  async getAllFeatureFlags(): Promise<FeatureFlag[]> {
    const flags: FeatureFlag[] = [];
    const pattern = 'feature:*';
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, matchedKeys] = await this.redisService.scan(cursor, pattern, 100);
      keys.push(...matchedKeys);
      cursor = nextCursor;
    } while (cursor !== '0');

    for (const key of keys) {
      const value = await this.redisService.get(key);
      const name = key.replace('feature:', '');
      flags.push({
        name,
        enabled: value === 'true',
        description: this.getFeatureDescription(name),
      });
    }

    return flags;
  }

  async deleteFeatureFlag(name: string): Promise<void> {
    const key = `feature:${name}`;
    await this.redisService.del(key);
    this.logger.log(`Feature flag '${name}' deleted`);
  }

  async isFeatureEnabled(name: string): Promise<boolean> {
    return this.getFeatureFlag(name);
  }

  private getFeatureDescription(name: string): string {
    const descriptions: Record<string, string> = {
      voice: 'Voice message support with ElevenLabs',
      ai: 'AI conversation with Gemini',
      'commands-only-mode': 'Restrict to command-only mode (disable AI)',
      balance: 'Balance checking feature',
      send: 'Send payment feature',
      receive: 'Receive payment feature',
      'pay-invoice': 'Pay Lightning invoice feature',
      contacts: 'Contact management feature',
      history: 'Transaction history feature',
      'price-check': 'BTC price checking feature',
    };

    return descriptions[name] || 'Custom feature flag';
  }
}
