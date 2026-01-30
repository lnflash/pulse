import { Injectable, Logger } from '@nestjs/common';
import { VoicePort, VoiceConfig, VoiceInfo } from '../../../core/ports/voice.port';
import { UserId } from '../../../core/types';
import { RedisService } from '../../redis/redis.service';

/**
 * VoiceAdapter implements the VoicePort interface
 * Manages user voice settings and available voices
 */
@Injectable()
export class VoiceAdapter implements VoicePort {
  private readonly logger = new Logger(VoiceAdapter.name);
  private readonly SETTINGS_PREFIX = 'user_voice_settings:';
  private readonly SETTINGS_TTL = 0; // Persistent

  // Available voices
  private readonly AVAILABLE_VOICES: VoiceInfo[] = [
    {
      name: 'Terri-Ann',
      voiceId: 'terri-ann',
      description: 'Warm, friendly female voice',
    },
    {
      name: 'Patience',
      voiceId: 'patience',
      description: 'Calm, professional female voice',
    },
    {
      name: 'Dean',
      voiceId: 'dean',
      description: 'Confident male voice',
    },
  ];

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get voice configuration for a user
   */
  async getVoiceConfig(userId: UserId): Promise<VoiceConfig> {
    try {
      const key = `${this.SETTINGS_PREFIX}${userId}`;
      const data = await this.redisService.get(key);

      if (!data) {
        return {
          mode: 'off',
        };
      }

      const settings = JSON.parse(data);
      return {
        mode: settings.mode || 'off',
        selectedVoice: settings.voiceName,
        selectedVoiceId: settings.voiceId,
      };
    } catch (error) {
      this.logger.error(`Error getting voice config for ${userId}: ${error.message}`);
      return {
        mode: 'off',
      };
    }
  }

  /**
   * Set voice mode for a user
   */
  async setVoiceMode(userId: UserId, mode: 'on' | 'off' | 'only'): Promise<void> {
    try {
      const key = `${this.SETTINGS_PREFIX}${userId}`;
      const config = await this.getVoiceConfig(userId);

      const settings = {
        mode,
        voiceName: config.selectedVoice,
        voiceId: config.selectedVoiceId,
        updatedAt: new Date().toISOString(),
      };

      await this.redisService.set(key, JSON.stringify(settings), this.SETTINGS_TTL);
    } catch (error) {
      this.logger.error(`Error setting voice mode for ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Select a voice for a user
   */
  async selectVoice(userId: UserId, voiceName: string, voiceId: string): Promise<void> {
    try {
      const key = `${this.SETTINGS_PREFIX}${userId}`;
      const config = await this.getVoiceConfig(userId);

      const settings = {
        mode: config.mode,
        voiceName,
        voiceId,
        updatedAt: new Date().toISOString(),
      };

      await this.redisService.set(key, JSON.stringify(settings), this.SETTINGS_TTL);
    } catch (error) {
      this.logger.error(`Error selecting voice for ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * List available voices
   */
  async listVoices(): Promise<VoiceInfo[]> {
    return this.AVAILABLE_VOICES;
  }
}
