import { Test, TestingModule } from '@nestjs/testing';
import { PendingPaymentService, PendingPayment } from './pending-payment.service';
import { RedisService } from '../../redis/redis.service';

describe('PendingPaymentService', () => {
  let service: PendingPaymentService;
  let redisService: jest.Mocked<RedisService>;

  const mockPaymentParams = {
    senderId: 'sender123',
    senderUsername: 'alice',
    senderPhone: '+1234567890',
    recipientPhone: '+0987654321',
    recipientName: 'Bob',
    amountCents: 5000, // $50.00
    memo: 'Test payment',
    escrowTransactionId: 'escrow123'
  };

  const mockPendingPayment: PendingPayment = {
    id: 'payment123',
    senderId: 'sender123',
    senderUsername: 'alice',
    senderPhone: '+1234567890',
    recipientPhone: '0987654321',
    recipientName: 'Bob',
    amountCents: 5000,
    claimCode: 'ABCD1234',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2099-12-31T00:00:00Z',  // Far future to ensure not expired
    memo: 'Test payment',
    escrowTransactionId: 'escrow123'
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendingPaymentService,
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            exists: jest.fn(),
            expire: jest.fn(),
            ttl: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<PendingPaymentService>(PendingPaymentService);
    redisService = module.get(RedisService);

    // Mock Date.now() for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T00:00:00Z').getTime());
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPendingPayment', () => {
    it('should create a pending payment successfully', async () => {
      // Arrange
      redisService.set.mockResolvedValue(undefined);
      redisService.get.mockResolvedValue(null);

      // Act
      const result = await service.createPendingPayment(mockPaymentParams);

      // Assert
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('claimCode');
      expect(result.status).toBe('pending');
      expect(result.recipientPhone).toBe('0987654321'); // Normalized
      expect(result.amountCents).toBe(5000);
      expect(redisService.set).toHaveBeenCalledTimes(3); // Payment + 2 indexes
    });

    it('should normalize phone numbers', async () => {
      // Arrange
      redisService.set.mockResolvedValue(undefined);
      redisService.get.mockResolvedValue(null);
      const params = {
        ...mockPaymentParams,
        recipientPhone: '+1 (234) 567-8901'
      };

      // Act
      const result = await service.createPendingPayment(params);

      // Assert
      expect(result.recipientPhone).toBe('12345678901');
    });

    it('should set correct expiry date', async () => {
      // Arrange
      redisService.set.mockResolvedValue(undefined);
      redisService.get.mockResolvedValue(null);

      // Act
      const result = await service.createPendingPayment(mockPaymentParams);

      // Assert
      const expiryDate = new Date(result.expiresAt);
      const expectedExpiry = new Date('2024-01-31T00:00:00Z');
      expect(expiryDate.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      redisService.set.mockRejectedValue(new Error('Redis connection error'));

      // Act & Assert
      await expect(service.createPendingPayment(mockPaymentParams)).rejects.toThrow('Redis connection error');
    });

    it('should create indexes for phone and sender lookup', async () => {
      // Arrange
      redisService.set.mockResolvedValue(undefined);
      redisService.get.mockResolvedValue(null);

      // Act
      await service.createPendingPayment(mockPaymentParams);

      // Assert
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('pending_by_phone:0987654321'),
        expect.any(String),
        expect.any(Number)
      );
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('pending_by_sender:sender123'),
        expect.any(String),
        expect.any(Number)
      );
    });
  });

  describe('createPendingPaymentWithCode', () => {
    it('should create payment with specific claim code', async () => {
      // Arrange
      redisService.set.mockResolvedValue(undefined);
      redisService.get.mockResolvedValue(null);
      const params = {
        ...mockPaymentParams,
        claimCode: 'CUSTOM123'
      };

      // Act
      const result = await service.createPendingPaymentWithCode(params);

      // Assert
      expect(result.claimCode).toBe('CUSTOM123');
      expect(redisService.set).toHaveBeenCalledTimes(3);
    });

    it('should handle all parameters correctly', async () => {
      // Arrange
      redisService.set.mockResolvedValue(undefined);
      redisService.get.mockResolvedValue(null);
      const params = {
        ...mockPaymentParams,
        claimCode: 'TEST1234',
        memo: 'Custom memo',
        escrowTransactionId: 'escrow456'
      };

      // Act
      const result = await service.createPendingPaymentWithCode(params);

      // Assert
      expect(result.claimCode).toBe('TEST1234');
      expect(result.memo).toBe('Custom memo');
      expect(result.escrowTransactionId).toBe('escrow456');
    });
  });

  describe('getPendingPaymentsByPhone', () => {
    it('should return pending payments for a phone number', async () => {
      // Arrange
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(['payment1', 'payment2']))
        .mockResolvedValueOnce(JSON.stringify(mockPendingPayment))
        .mockResolvedValueOnce(JSON.stringify({ ...mockPendingPayment, id: 'payment2' }));

      // Act
      const result = await service.getPendingPaymentsByPhone('+0987654321');

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockPendingPayment);
    });

    it('should normalize phone number for lookup', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);

      // Act
      await service.getPendingPaymentsByPhone('+1 (234) 567-8901');

      // Assert
      expect(redisService.get).toHaveBeenCalledWith('pending_by_phone:12345678901');
    });

    it('should filter out non-pending payments', async () => {
      // Arrange
      const claimedPayment = { ...mockPendingPayment, status: 'claimed' as const };
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(['payment1', 'payment2']))
        .mockResolvedValueOnce(JSON.stringify(mockPendingPayment))
        .mockResolvedValueOnce(JSON.stringify(claimedPayment));

      // Act
      const result = await service.getPendingPaymentsByPhone('0987654321');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
    });

    it('should return empty array when no payments found', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);

      // Act
      const result = await service.getPendingPaymentsByPhone('1234567890');

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      redisService.get.mockRejectedValue(new Error('Redis error'));

      // Act
      const result = await service.getPendingPaymentsByPhone('1234567890');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getPendingPaymentsBySender', () => {
    it('should return all payments sent by a user', async () => {
      // Arrange
      const payment2 = { ...mockPendingPayment, id: 'payment2', status: 'claimed' as const };
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(['payment1', 'payment2']))
        .mockResolvedValueOnce(JSON.stringify(mockPendingPayment))
        .mockResolvedValueOnce(JSON.stringify(payment2));

      // Act
      const result = await service.getPendingPaymentsBySender('sender123');

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockPendingPayment);
      expect(result[1]).toEqual(payment2);
    });

    it('should return empty array when sender has no payments', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);

      // Act
      const result = await service.getPendingPaymentsBySender('sender456');

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      redisService.get.mockRejectedValue(new Error('Redis error'));

      // Act
      const result = await service.getPendingPaymentsBySender('sender123');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getPendingPayment', () => {
    it('should return a specific pending payment', async () => {
      // Arrange
      redisService.get.mockResolvedValue(JSON.stringify(mockPendingPayment));

      // Act
      const result = await service.getPendingPayment('payment123');

      // Assert
      expect(result).toEqual(mockPendingPayment);
      expect(redisService.get).toHaveBeenCalledWith('pending_payment:payment123');
    });

    it('should return null when payment not found', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);

      // Act
      const result = await service.getPendingPayment('nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('should handle malformed JSON gracefully', async () => {
      // Arrange
      redisService.get.mockResolvedValue('invalid json');

      // Act
      const result = await service.getPendingPayment('payment123');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('claimPendingPayment', () => {
    it('should successfully claim a pending payment', async () => {
      // Arrange
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(mockPendingPayment))  // getPendingPayment
        .mockResolvedValueOnce(JSON.stringify(['payment123']));      // removeFromPhoneIndex
      redisService.set.mockResolvedValue(undefined);
      redisService.del.mockResolvedValue(1);

      // Act
      const result = await service.claimPendingPayment('payment123', 'claimer123');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.status).toBe('claimed');
      expect(result!.claimedById).toBe('claimer123');
      expect(result!.claimedAt).toBeDefined();
    });

    it('should return null when payment not found', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);

      // Act
      const result = await service.claimPendingPayment('nonexistent', 'claimer123');

      // Assert
      expect(result).toBeNull();
    });

    it('should not claim already claimed payment', async () => {
      // Arrange
      const claimedPayment = { ...mockPendingPayment, status: 'claimed' as const };
      redisService.get.mockResolvedValue(JSON.stringify(claimedPayment));

      // Act
      const result = await service.claimPendingPayment('payment123', 'claimer123');

      // Assert
      expect(result).toBeNull();
    });

    it('should mark expired payments as expired', async () => {
      // Arrange
      const expiredPayment = {
        ...mockPendingPayment,
        expiresAt: '2023-12-01T00:00:00Z'
      };
      redisService.get.mockResolvedValue(JSON.stringify(expiredPayment));
      redisService.del.mockResolvedValue(1);

      // Act
      const result = await service.claimPendingPayment('payment123', 'claimer123');

      // Assert
      expect(result).toBeNull();
      // When expired, payment is deleted (TTL is negative)
      expect(redisService.del).toHaveBeenCalledWith('pending_payment:payment123');
    });

    it('should remove payment from phone index after claiming', async () => {
      // Arrange
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(mockPendingPayment))
        .mockResolvedValueOnce(JSON.stringify(['payment123', 'payment456']));
      redisService.set.mockResolvedValue(undefined);
      redisService.del.mockResolvedValue(1);

      // Act
      await service.claimPendingPayment('payment123', 'claimer123');

      // Assert
      expect(redisService.set).toHaveBeenCalledWith(
        'pending_by_phone:0987654321',
        JSON.stringify(['payment456']),
        expect.any(Number)
      );
    });
  });

  describe('cancelPendingPayment', () => {
    it('should successfully cancel a pending payment', async () => {
      // Arrange
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(mockPendingPayment))
        .mockResolvedValueOnce(JSON.stringify(['payment123']));
      redisService.set.mockResolvedValue(undefined);
      redisService.del.mockResolvedValue(1);

      // Act
      const result = await service.cancelPendingPayment('payment123', 'sender123');

      // Assert
      expect(result).toBe(true);
      expect(redisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"status":"cancelled"'),
        expect.any(Number)
      );
    });

    it('should not allow cancellation by non-sender', async () => {
      // Arrange
      redisService.get.mockResolvedValue(JSON.stringify(mockPendingPayment));

      // Act
      const result = await service.cancelPendingPayment('payment123', 'othersender');

      // Assert
      expect(result).toBe(false);
    });

    it('should not cancel already claimed payment', async () => {
      // Arrange
      const claimedPayment = { ...mockPendingPayment, status: 'claimed' as const };
      redisService.get.mockResolvedValue(JSON.stringify(claimedPayment));

      // Act
      const result = await service.cancelPendingPayment('payment123', 'sender123');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when payment not found', async () => {
      // Arrange
      redisService.get.mockResolvedValue(null);

      // Act
      const result = await service.cancelPendingPayment('nonexistent', 'sender123');

      // Assert
      expect(result).toBe(false);
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      redisService.get.mockRejectedValue(new Error('Redis error'));

      // Act
      const result = await service.cancelPendingPayment('payment123', 'sender123');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('formatPendingPaymentMessage', () => {
    it('should format payment message correctly', () => {
      // Act
      const result = service.formatPendingPaymentMessage(mockPendingPayment);

      // Assert
      expect(result).toContain('$50.00 USD');
      expect(result).toContain('@alice');
      expect(result).toContain('Test payment');
      expect(result).toContain('ABCD1234');
      expect(result).toContain('days');  // Just check that days is mentioned, not the exact number
    });

    it('should handle payment without memo', () => {
      // Arrange
      const paymentNoMemo = { ...mockPendingPayment, memo: undefined };

      // Act
      const result = service.formatPendingPaymentMessage(paymentNoMemo);

      // Assert
      expect(result).toContain('$50.00 USD');
      expect(result).not.toContain('Message:');
    });

    it('should calculate expiry days correctly', () => {
      // Arrange
      const payment = {
        ...mockPendingPayment,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };

      // Act
      const result = service.formatPendingPaymentMessage(payment);

      // Assert
      expect(result).toContain('7 days');
    });

    it('should handle amounts with cents correctly', () => {
      // Arrange
      const payment = { ...mockPendingPayment, amountCents: 1234 }; // $12.34

      // Act
      const result = service.formatPendingPaymentMessage(payment);

      // Assert
      expect(result).toContain('$12.34 USD');
    });
  });

  describe('Private Methods', () => {
    describe('generateClaimCode', () => {
      it('should generate unique claim codes', () => {
        // Arrange
        const codes = new Set<string>();

        // Act - Generate multiple codes
        for (let i = 0; i < 100; i++) {
          const code = (service as any).generateClaimCode();
          codes.add(code);
        }

        // Assert - All codes should be unique
        expect(codes.size).toBe(100);
      });

      it('should generate codes with correct format', () => {
        // Act
        const code = (service as any).generateClaimCode();

        // Assert
        expect(code).toMatch(/^[A-F0-9]{8}$/);
        expect(code).toHaveLength(8);
      });
    });

    describe('updatePendingPayment', () => {
      it('should update payment with correct TTL', async () => {
        // Arrange
        const futureDate = new Date('2024-01-15T00:00:00Z');
        const payment = { ...mockPendingPayment, expiresAt: futureDate.toISOString() };
        redisService.set.mockResolvedValue(undefined);

        // Act
        await (service as any).updatePendingPayment(payment);

        // Assert
        const expectedTTL = Math.floor((futureDate.getTime() - Date.now()) / 1000);
        expect(redisService.set).toHaveBeenCalledWith(
          'pending_payment:payment123',
          JSON.stringify(payment),
          expectedTTL
        );
      });

      it('should delete payment when TTL is negative', async () => {
        // Arrange
        const pastDate = new Date('2023-12-01T00:00:00Z');
        const payment = { ...mockPendingPayment, expiresAt: pastDate.toISOString() };
        redisService.del.mockResolvedValue(1);

        // Act
        await (service as any).updatePendingPayment(payment);

        // Assert
        expect(redisService.del).toHaveBeenCalledWith('pending_payment:payment123');
        expect(redisService.set).not.toHaveBeenCalled();
      });
    });

    describe('Index Management', () => {
      it('should add payment to phone index', async () => {
        // Arrange
        redisService.get.mockResolvedValue(JSON.stringify(['existing1']));
        redisService.set.mockResolvedValue(undefined);

        // Act
        await (service as any).addToPhoneIndex('1234567890', 'newpayment');

        // Assert
        expect(redisService.set).toHaveBeenCalledWith(
          'pending_by_phone:1234567890',
          JSON.stringify(['existing1', 'newpayment']),
          expect.any(Number)
        );
      });

      it('should not add duplicate payment IDs to index', async () => {
        // Arrange
        redisService.get.mockResolvedValue(JSON.stringify(['payment1', 'payment2']));
        redisService.set.mockResolvedValue(undefined);

        // Act
        await (service as any).addToPhoneIndex('1234567890', 'payment1');

        // Assert
        expect(redisService.set).not.toHaveBeenCalled();
      });

      it('should remove payment from phone index', async () => {
        // Arrange
        redisService.get.mockResolvedValue(JSON.stringify(['payment1', 'payment2', 'payment3']));
        redisService.set.mockResolvedValue(undefined);

        // Act
        await (service as any).removeFromPhoneIndex('1234567890', 'payment2');

        // Assert
        expect(redisService.set).toHaveBeenCalledWith(
          'pending_by_phone:1234567890',
          JSON.stringify(['payment1', 'payment3']),
          expect.any(Number)
        );
      });

      it('should delete index when last payment removed', async () => {
        // Arrange
        redisService.get.mockResolvedValue(JSON.stringify(['payment1']));
        redisService.del.mockResolvedValue(1);

        // Act
        await (service as any).removeFromPhoneIndex('1234567890', 'payment1');

        // Assert
        expect(redisService.del).toHaveBeenCalledWith('pending_by_phone:1234567890');
        expect(redisService.set).not.toHaveBeenCalled();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large amounts', async () => {
      // Arrange
      const largeAmount = 100000000; // $1,000,000.00
      const payment = { ...mockPendingPayment, amountCents: largeAmount };

      // Act
      const result = service.formatPendingPaymentMessage(payment);

      // Assert
      expect(result).toContain('$1000000.00');
    });

    it('should handle zero amount', async () => {
      // Arrange
      const payment = { ...mockPendingPayment, amountCents: 0 };

      // Act
      const result = service.formatPendingPaymentMessage(payment);

      // Assert
      expect(result).toContain('$0.00');
    });

    it('should handle special characters in memo', async () => {
      // Arrange
      redisService.set.mockResolvedValue(undefined);
      redisService.get.mockResolvedValue(null);
      const params = {
        ...mockPaymentParams,
        memo: '🚀 Payment for "services" & goods < $100 >'
      };

      // Act
      const result = await service.createPendingPayment(params);

      // Assert
      expect(result.memo).toBe('🚀 Payment for "services" & goods < $100 >');
    });

    it('should handle concurrent claim attempts', async () => {
      // Arrange
      redisService.get
        .mockResolvedValueOnce(JSON.stringify(mockPendingPayment))
        .mockResolvedValueOnce(JSON.stringify({ ...mockPendingPayment, status: 'claimed' as const }));

      // Simulate first claim succeeding
      redisService.set.mockResolvedValue(undefined);

      // Act - Two concurrent claims
      const claim1 = service.claimPendingPayment('payment123', 'claimer1');
      const claim2 = service.claimPendingPayment('payment123', 'claimer2');

      const results = await Promise.all([claim1, claim2]);

      // Assert - Only one should succeed
      const successfulClaims = results.filter(r => r !== null);
      expect(successfulClaims.length).toBeLessThanOrEqual(1);
    });

    it('should handle payment expiry at exact boundary', async () => {
      // Arrange
      const exactExpiry = new Date(Date.now());
      const payment = { ...mockPendingPayment, expiresAt: exactExpiry.toISOString() };
      redisService.get.mockResolvedValue(JSON.stringify(payment));
      redisService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.claimPendingPayment('payment123', 'claimer123');

      // Assert
      expect(result).toBeNull();
    });
  });
});