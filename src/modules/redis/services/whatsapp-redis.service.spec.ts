import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppRedisService } from './whatsapp-redis.service';
import { RedisService } from '../redis.service';
import { WhatsAppIdNormalizer } from '../../../common/utils/whatsapp/whatsapp-id-normalizer';

describe('WhatsAppRedisService', () => {
  let service: WhatsAppRedisService;
  let redisService: jest.Mocked<RedisService>;
  let idNormalizer: jest.Mocked<WhatsAppIdNormalizer>;

  const mockWhatsappId = '1234567890@lid';
  const mockAlternativeIds = ['1234567890@c.us', '1234567890@s.whatsapp.net', '1234567890@lid'];
  const mockValue = 'test-value';
  const mockEncryptedValue = { encrypted: 'data', user: 'info' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppRedisService,
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            getEncrypted: jest.fn(),
            set: jest.fn(),
            setEncrypted: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: WhatsAppIdNormalizer,
          useValue: {
            isLidFormat: jest.fn(),
            getPossibleFormats: jest.fn(),
            normalize: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsAppRedisService>(WhatsAppRedisService);
    redisService = module.get(RedisService);
    idNormalizer = module.get(WhatsAppIdNormalizer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWithIdNormalization', () => {
    it('should get value with original ID if found', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      redisService.get.mockResolvedValue(mockValue);

      // Act
      const result = await service.getWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(result).toBe(mockValue);
      expect(redisService.get).toHaveBeenCalledWith('user:1234567890@lid:data');
      expect(idNormalizer.isLidFormat).not.toHaveBeenCalled();
    });

    it('should try alternative formats when original not found and ID is lid format', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      redisService.get
        .mockResolvedValueOnce(null) // Original ID not found
        .mockResolvedValueOnce(null) // First alternative not found
        .mockResolvedValueOnce(mockValue); // Second alternative found
      
      idNormalizer.isLidFormat.mockReturnValue(true);
      idNormalizer.getPossibleFormats.mockReturnValue(mockAlternativeIds);

      // Act
      const result = await service.getWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(result).toBe(mockValue);
      expect(redisService.get).toHaveBeenCalledTimes(3);
      expect(redisService.get).toHaveBeenNthCalledWith(1, 'user:1234567890@lid:data');
      expect(redisService.get).toHaveBeenNthCalledWith(2, 'user:1234567890@c.us:data');
      expect(redisService.get).toHaveBeenNthCalledWith(3, 'user:1234567890@s.whatsapp.net:data');
    });

    it('should return null when value not found in any format', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      redisService.get.mockResolvedValue(null);
      idNormalizer.isLidFormat.mockReturnValue(true);
      idNormalizer.getPossibleFormats.mockReturnValue(mockAlternativeIds);

      // Act
      const result = await service.getWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(result).toBeNull();
      expect(redisService.get).toHaveBeenCalledTimes(3);
    });

    it('should not try alternatives for non-lid format IDs', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      const regularId = '1234567890@c.us';
      redisService.get.mockResolvedValue(null);
      idNormalizer.isLidFormat.mockReturnValue(false);

      // Act
      const result = await service.getWithIdNormalization(keyPattern, regularId);

      // Assert
      expect(result).toBeNull();
      expect(redisService.get).toHaveBeenCalledTimes(1);
      expect(redisService.get).toHaveBeenCalledWith('user:1234567890@c.us:data');
      expect(idNormalizer.getPossibleFormats).not.toHaveBeenCalled();
    });

    it('should handle complex key patterns', async () => {
      // Arrange
      const keyPattern = 'prefix:${whatsappId}:middle:${whatsappId}:suffix';
      redisService.get.mockResolvedValue(mockValue);

      // Act
      const result = await service.getWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(result).toBe(mockValue);
      expect(redisService.get).toHaveBeenCalledWith(
        'prefix:1234567890@lid:middle:1234567890@lid:suffix'
      );
    });

    it('should log debug message when found with alternative format', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      jest.spyOn(service['logger'], 'debug');
      
      redisService.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockValue);
      
      idNormalizer.isLidFormat.mockReturnValue(true);
      idNormalizer.getPossibleFormats.mockReturnValue(['1234567890@lid', '1234567890@c.us']);

      // Act
      await service.getWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(service['logger'].debug).toHaveBeenCalledWith(
        'Found data with alternative format: 1234567890@c.us'
      );
    });
  });

  describe('getEncryptedWithIdNormalization', () => {
    it('should get encrypted value with original ID if found', async () => {
      // Arrange
      const keyPattern = 'encrypted:${whatsappId}:data';
      redisService.getEncrypted.mockResolvedValue(mockEncryptedValue);

      // Act
      const result = await service.getEncryptedWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(result).toEqual(mockEncryptedValue);
      expect(redisService.getEncrypted).toHaveBeenCalledWith('encrypted:1234567890@lid:data');
      expect(idNormalizer.isLidFormat).not.toHaveBeenCalled();
    });

    it('should try alternative formats for encrypted data', async () => {
      // Arrange
      const keyPattern = 'encrypted:${whatsappId}:data';
      redisService.getEncrypted
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockEncryptedValue);
      
      idNormalizer.isLidFormat.mockReturnValue(true);
      idNormalizer.getPossibleFormats.mockReturnValue(['1234567890@lid', '1234567890@c.us']);

      // Act
      const result = await service.getEncryptedWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(result).toEqual(mockEncryptedValue);
      expect(redisService.getEncrypted).toHaveBeenCalledTimes(2);
      expect(redisService.getEncrypted).toHaveBeenNthCalledWith(2, 'encrypted:1234567890@c.us:data');
    });

    it('should return null when encrypted value not found', async () => {
      // Arrange
      const keyPattern = 'encrypted:${whatsappId}:data';
      redisService.getEncrypted.mockResolvedValue(null);
      idNormalizer.isLidFormat.mockReturnValue(true);
      idNormalizer.getPossibleFormats.mockReturnValue(mockAlternativeIds);

      // Act
      const result = await service.getEncryptedWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(result).toBeNull();
      expect(redisService.getEncrypted).toHaveBeenCalledTimes(3);
    });

    it('should log debug message when encrypted data found with alternative', async () => {
      // Arrange
      const keyPattern = 'encrypted:${whatsappId}:data';
      jest.spyOn(service['logger'], 'debug');
      
      redisService.getEncrypted
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockEncryptedValue);
      
      idNormalizer.isLidFormat.mockReturnValue(true);
      idNormalizer.getPossibleFormats.mockReturnValue(['1234567890@lid', '1234567890@c.us']);

      // Act
      await service.getEncryptedWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(service['logger'].debug).toHaveBeenCalledWith(
        'Found encrypted data with alternative format: 1234567890@c.us'
      );
    });
  });

  describe('setWithIdNormalization', () => {
    it('should set value with normalized ID', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      const normalizedId = '1234567890@c.us';
      idNormalizer.normalize.mockReturnValue(normalizedId);

      // Act
      await service.setWithIdNormalization(keyPattern, mockWhatsappId, mockValue, 3600);

      // Assert
      expect(idNormalizer.normalize).toHaveBeenCalledWith(mockWhatsappId);
      expect(redisService.set).toHaveBeenCalledWith('user:1234567890@c.us:data', mockValue, 3600);
    });

    it('should set value without TTL', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      const normalizedId = '1234567890@c.us';
      idNormalizer.normalize.mockReturnValue(normalizedId);

      // Act
      await service.setWithIdNormalization(keyPattern, mockWhatsappId, mockValue);

      // Assert
      expect(redisService.set).toHaveBeenCalledWith(
        'user:1234567890@c.us:data',
        mockValue,
        undefined
      );
    });

    it('should handle complex key patterns when setting', async () => {
      // Arrange
      const keyPattern = 'prefix:${whatsappId}:${whatsappId}:suffix';
      const normalizedId = '1234567890@c.us';
      idNormalizer.normalize.mockReturnValue(normalizedId);

      // Act
      await service.setWithIdNormalization(keyPattern, mockWhatsappId, mockValue);

      // Assert
      expect(redisService.set).toHaveBeenCalledWith(
        'prefix:1234567890@c.us:1234567890@c.us:suffix',
        mockValue,
        undefined
      );
    });
  });

  describe('setEncryptedWithIdNormalization', () => {
    it('should set encrypted value with normalized ID', async () => {
      // Arrange
      const keyPattern = 'encrypted:${whatsappId}:data';
      const normalizedId = '1234567890@c.us';
      idNormalizer.normalize.mockReturnValue(normalizedId);

      // Act
      await service.setEncryptedWithIdNormalization(
        keyPattern,
        mockWhatsappId,
        mockEncryptedValue,
        7200
      );

      // Assert
      expect(idNormalizer.normalize).toHaveBeenCalledWith(mockWhatsappId);
      expect(redisService.setEncrypted).toHaveBeenCalledWith(
        'encrypted:1234567890@c.us:data',
        mockEncryptedValue,
        7200
      );
    });

    it('should set encrypted value without TTL', async () => {
      // Arrange
      const keyPattern = 'encrypted:${whatsappId}:data';
      const normalizedId = '1234567890@c.us';
      idNormalizer.normalize.mockReturnValue(normalizedId);

      // Act
      await service.setEncryptedWithIdNormalization(keyPattern, mockWhatsappId, mockEncryptedValue);

      // Assert
      expect(redisService.setEncrypted).toHaveBeenCalledWith(
        'encrypted:1234567890@c.us:data',
        mockEncryptedValue,
        undefined
      );
    });
  });

  describe('delWithIdNormalization', () => {
    it('should delete all possible ID formats', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      idNormalizer.getPossibleFormats.mockReturnValue(mockAlternativeIds);

      // Act
      await service.delWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(idNormalizer.getPossibleFormats).toHaveBeenCalledWith(mockWhatsappId);
      expect(redisService.del).toHaveBeenCalledTimes(3);
      expect(redisService.del).toHaveBeenNthCalledWith(1, 'user:1234567890@c.us:data');
      expect(redisService.del).toHaveBeenNthCalledWith(2, 'user:1234567890@s.whatsapp.net:data');
      expect(redisService.del).toHaveBeenNthCalledWith(3, 'user:1234567890@lid:data');
    });

    it('should handle single format deletion', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      const regularId = '1234567890@c.us';
      idNormalizer.getPossibleFormats.mockReturnValue([regularId]);

      // Act
      await service.delWithIdNormalization(keyPattern, regularId);

      // Assert
      expect(redisService.del).toHaveBeenCalledTimes(1);
      expect(redisService.del).toHaveBeenCalledWith('user:1234567890@c.us:data');
    });

    it('should handle complex key patterns when deleting', async () => {
      // Arrange
      const keyPattern = 'prefix:${whatsappId}:middle:${whatsappId}:suffix';
      idNormalizer.getPossibleFormats.mockReturnValue(['1234567890@c.us']);

      // Act
      await service.delWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(redisService.del).toHaveBeenCalledWith(
        'prefix:1234567890@c.us:middle:1234567890@c.us:suffix'
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle empty whatsapp ID', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      redisService.get.mockResolvedValue(null);
      idNormalizer.isLidFormat.mockReturnValue(false);

      // Act
      const result = await service.getWithIdNormalization(keyPattern, '');

      // Assert
      expect(result).toBeNull();
      expect(redisService.get).toHaveBeenCalledWith('user::data');
    });

    it('should handle key pattern without placeholder', async () => {
      // Arrange
      const keyPattern = 'static:key';
      redisService.get.mockResolvedValue(mockValue);

      // Act
      const result = await service.getWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(result).toBe(mockValue);
      expect(redisService.get).toHaveBeenCalledWith('static:key');
    });

    it('should handle concurrent operations', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      redisService.get.mockResolvedValue(mockValue);

      // Act
      const promises = Array(5).fill(null).map(() =>
        service.getWithIdNormalization(keyPattern, mockWhatsappId)
      );
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(5);
      results.forEach(result => expect(result).toBe(mockValue));
      expect(redisService.get).toHaveBeenCalledTimes(5);
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      redisService.get.mockRejectedValue(new Error('Redis connection error'));

      // Act & Assert
      await expect(
        service.getWithIdNormalization(keyPattern, mockWhatsappId)
      ).rejects.toThrow('Redis connection error');
    });

    it('should skip original ID when checking alternatives', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      redisService.get.mockResolvedValue(null);
      idNormalizer.isLidFormat.mockReturnValue(true);
      idNormalizer.getPossibleFormats.mockReturnValue([
        mockWhatsappId, // Original
        '1234567890@c.us', // Alternative
      ]);

      // Act
      await service.getWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(redisService.get).toHaveBeenCalledTimes(2);
      expect(redisService.get).toHaveBeenNthCalledWith(1, 'user:1234567890@lid:data');
      expect(redisService.get).toHaveBeenNthCalledWith(2, 'user:1234567890@c.us:data');
    });

    it('should handle very long WhatsApp IDs', async () => {
      // Arrange
      const longId = '1'.repeat(50) + '@lid';
      const keyPattern = 'user:${whatsappId}:data';
      redisService.get.mockResolvedValue(mockValue);

      // Act
      const result = await service.getWithIdNormalization(keyPattern, longId);

      // Assert
      expect(result).toBe(mockValue);
      expect(redisService.get).toHaveBeenCalledWith(`user:${longId}:data`);
    });

    it('should handle special characters in WhatsApp ID', async () => {
      // Arrange
      const specialId = '123-456.789_0@lid';
      const keyPattern = 'user:${whatsappId}:data';
      redisService.get.mockResolvedValue(mockValue);

      // Act
      const result = await service.getWithIdNormalization(keyPattern, specialId);

      // Assert
      expect(result).toBe(mockValue);
      expect(redisService.get).toHaveBeenCalledWith('user:123-456.789_0@lid:data');
    });

    it('should handle multiple placeholders correctly', async () => {
      // Arrange
      const keyPattern = '${whatsappId}:${whatsappId}:${whatsappId}';
      const normalizedId = '1234567890@c.us';
      idNormalizer.normalize.mockReturnValue(normalizedId);

      // Act
      await service.setWithIdNormalization(keyPattern, mockWhatsappId, mockValue);

      // Assert
      expect(redisService.set).toHaveBeenCalledWith(
        '1234567890@c.us:1234567890@c.us:1234567890@c.us',
        mockValue,
        undefined
      );
    });

    it('should handle null values from Redis', async () => {
      // Arrange
      const keyPattern = 'user:${whatsappId}:data';
      redisService.get.mockResolvedValue(null);
      redisService.getEncrypted.mockResolvedValue(null);
      idNormalizer.isLidFormat.mockReturnValue(false);

      // Act
      const result1 = await service.getWithIdNormalization(keyPattern, mockWhatsappId);
      const result2 = await service.getEncryptedWithIdNormalization(keyPattern, mockWhatsappId);

      // Assert
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });
});