import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis.service';
import { WhatsAppIdNormalizer } from '../../../common/utils/whatsapp/whatsapp-id-normalizer';

/**
 * Redis service wrapper that handles WhatsApp ID format normalization
 * This service automatically tries multiple WhatsApp ID formats when
 * retrieving data, solving the issue where users link with one format
 * (e.g., @c.us) but access the bot with another (e.g., @lid)
 */
@Injectable()
export class WhatsAppRedisService {
  private readonly logger = new Logger(WhatsAppRedisService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly idNormalizer: WhatsAppIdNormalizer,
  ) {}

  /**
   * Get a value from Redis, trying multiple WhatsApp ID formats if needed
   */
  async getWithIdNormalization(keyPattern: string, whatsappId: string): Promise<string | null> {
    // First try with the original ID
    const originalKey = keyPattern.replaceAll('${whatsappId}', whatsappId);
    let value = await this.redisService.get(originalKey);

    if (value) {
      return value;
    }

    // If not found and it's an @lid format, try alternatives
    if (this.idNormalizer.isLidFormat(whatsappId)) {
      const alternativeIds = this.idNormalizer.getPossibleFormats(whatsappId);

      for (const altId of alternativeIds) {
        if (altId !== whatsappId) {
          // Skip the original
          const altKey = keyPattern.replaceAll('${whatsappId}', altId);
          value = await this.redisService.get(altKey);

          if (value) {
            this.logger.debug(`Found data with alternative format: ${altId}`);
            return value;
          }
        }
      }
    }

    return null;
  }

  /**
   * Get encrypted value from Redis, trying multiple WhatsApp ID formats if needed
   */
  async getEncryptedWithIdNormalization(
    keyPattern: string,
    whatsappId: string,
  ): Promise<any | null> {
    // First try with the original ID
    const originalKey = keyPattern.replaceAll('${whatsappId}', whatsappId);
    let value = await this.redisService.getEncrypted(originalKey);

    if (value) {
      return value;
    }

    // If not found and it's an @lid format, try alternatives
    if (this.idNormalizer.isLidFormat(whatsappId)) {
      const alternativeIds = this.idNormalizer.getPossibleFormats(whatsappId);

      for (const altId of alternativeIds) {
        if (altId !== whatsappId) {
          // Skip the original
          const altKey = keyPattern.replaceAll('${whatsappId}', altId);
          value = await this.redisService.getEncrypted(altKey);

          if (value) {
            this.logger.debug(`Found encrypted data with alternative format: ${altId}`);
            return value;
          }
        }
      }
    }

    return null;
  }

  /**
   * Set a value in Redis using normalized WhatsApp ID
   * This ensures consistent storage format
   */
  async setWithIdNormalization(
    keyPattern: string,
    whatsappId: string,
    value: string,
    ttl?: number,
  ): Promise<void> {
    const normalizedId = this.idNormalizer.normalize(whatsappId);
    const key = keyPattern.replaceAll('${whatsappId}', normalizedId);
    await this.redisService.set(key, value, ttl);
  }

  /**
   * Set encrypted value in Redis using normalized WhatsApp ID
   */
  async setEncryptedWithIdNormalization(
    keyPattern: string,
    whatsappId: string,
    value: any,
    ttl?: number,
  ): Promise<void> {
    const normalizedId = this.idNormalizer.normalize(whatsappId);
    const key = keyPattern.replaceAll('${whatsappId}', normalizedId);
    await this.redisService.setEncrypted(key, value, ttl);
  }

  /**
   * Delete a key from Redis, trying multiple WhatsApp ID formats
   */
  async delWithIdNormalization(keyPattern: string, whatsappId: string): Promise<void> {
    const possibleIds = this.idNormalizer.getPossibleFormats(whatsappId);

    for (const id of possibleIds) {
      const key = keyPattern.replaceAll('${whatsappId}', id);
      await this.redisService.del(key);
    }
  }
}
