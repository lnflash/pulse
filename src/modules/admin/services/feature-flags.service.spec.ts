import { Test, TestingModule } from '@nestjs/testing';
import { FeatureFlagsService } from './feature-flags.service';
import { RedisService } from '../../../common/redis/redis.service';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FeatureFlagsService, { provide: RedisService, useValue: mockRedisService }],
    }).compile();

    service = module.get<FeatureFlagsService>(FeatureFlagsService);
    redisService = module.get(RedisService);
  });

  describe('getFeatureFlag', () => {
    it('should return true for enabled feature', async () => {
      redisService.get.mockResolvedValue('true');

      const result = await service.getFeatureFlag('voice');

      expect(result).toBe(true);
      expect(redisService.get).toHaveBeenCalledWith('feature:voice');
    });

    it('should return false for disabled feature', async () => {
      redisService.get.mockResolvedValue('false');

      const result = await service.getFeatureFlag('ai');

      expect(result).toBe(false);
    });

    it('should return false for non-existent feature', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.getFeatureFlag('unknown');

      expect(result).toBe(false);
    });
  });

  describe('setFeatureFlag', () => {
    it('should enable feature flag', async () => {
      redisService.set.mockResolvedValue(undefined);

      await service.setFeatureFlag('voice', true);

      expect(redisService.set).toHaveBeenCalledWith('feature:voice', 'true');
    });

    it('should disable feature flag', async () => {
      redisService.set.mockResolvedValue(undefined);

      await service.setFeatureFlag('ai', false);

      expect(redisService.set).toHaveBeenCalledWith('feature:ai', 'false');
    });
  });

  describe('getAllFeatureFlags', () => {
    it('should return all feature flags', async () => {
      redisService.scan.mockResolvedValue(['0', ['feature:voice', 'feature:ai']]);
      redisService.get.mockResolvedValueOnce('true').mockResolvedValueOnce('false');

      const result = await service.getAllFeatureFlags();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'voice',
        enabled: true,
        description: 'Voice message support with ElevenLabs',
      });
      expect(result[1]).toEqual({
        name: 'ai',
        enabled: false,
        description: 'AI conversation with Gemini',
      });
    });

    it('should handle empty feature flags', async () => {
      redisService.scan.mockResolvedValue(['0', []]);

      const result = await service.getAllFeatureFlags();

      expect(result).toHaveLength(0);
    });

    it('should handle pagination with scan', async () => {
      redisService.scan
        .mockResolvedValueOnce(['1', ['feature:voice']])
        .mockResolvedValueOnce(['0', ['feature:ai']]);
      redisService.get.mockResolvedValueOnce('true').mockResolvedValueOnce('false');

      const result = await service.getAllFeatureFlags();

      expect(result).toHaveLength(2);
      expect(redisService.scan).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteFeatureFlag', () => {
    it('should delete feature flag', async () => {
      redisService.del.mockResolvedValue(undefined);

      await service.deleteFeatureFlag('voice');

      expect(redisService.del).toHaveBeenCalledWith('feature:voice');
    });
  });

  describe('isFeatureEnabled', () => {
    it('should check if feature is enabled', async () => {
      redisService.get.mockResolvedValue('true');

      const result = await service.isFeatureEnabled('voice');

      expect(result).toBe(true);
    });
  });
});
