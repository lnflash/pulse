import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../services/session.service';
import { RedisService } from '../../../common/redis/redis.service';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { UserId } from '../../../core/types';

describe('SessionService', () => {
  let service: SessionService;
  let store: Map<string, string>;
  let cryptoService: CryptoService;

  beforeEach(async () => {
    store = new Map();

    const mockRedis = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string, _ttl?: number) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      del: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
    };

    const mockConfig = {
      get: jest.fn((key: string) => {
        const config: Record<string, any> = {
          'security.sessionExpiry': 86400,
          ENCRYPTION_KEY: 'test-encryption-key-that-is-at-least-32-chars-long!!',
          ENCRYPTION_SALT: 'test-salt-value',
          HASH_SALT: 'test-hash-salt',
        };
        return config[key];
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
        CryptoService,
      ],
    }).compile();

    service = module.get(SessionService);
    cryptoService = module.get(CryptoService);
  });

  it('getSession returns null for unknown user', async () => {
    const userId = UserId.generate();
    expect(await service.getSession(userId)).toBeNull();
  });

  it('getOrCreateSession creates and returns session', async () => {
    const userId = UserId.generate();
    const session = await service.getOrCreateSession(userId);
    expect(session.userId.value).toBe(userId.value);
    expect(session.lastActivity).toBeInstanceOf(Date);
  });

  it('getOrCreateSession is idempotent', async () => {
    const userId = UserId.generate();
    await service.getOrCreateSession(userId);
    const second = await service.getOrCreateSession(userId);
    expect(second.userId.value).toBe(userId.value);
  });

  it('round-trip: create, get, update, get', async () => {
    const userId = UserId.generate();
    await service.getOrCreateSession(userId);

    await service.updateSession(userId, {
      flashUserId: 'flash-123',
      language: 'en',
    });

    const updated = await service.getSession(userId);
    expect(updated).not.toBeNull();
    expect(updated!.flashUserId).toBe('flash-123');
    expect(updated!.language).toBe('en');
  });

  it('flashAuthToken is encrypted at rest', async () => {
    const userId = UserId.generate();
    await service.getOrCreateSession(userId);

    const plainToken = 'super-secret-auth-token-12345';
    await service.updateSession(userId, { flashAuthToken: plainToken });

    const rawStored = store.get(`session:${userId.value}`);
    expect(rawStored).toBeDefined();
    expect(rawStored).not.toContain(plainToken);

    const session = await service.getSession(userId);
    expect(session!.flashAuthToken).toBe(plainToken);
  });

  it('deleteSession removes session', async () => {
    const userId = UserId.generate();
    await service.getOrCreateSession(userId);
    await service.deleteSession(userId);
    expect(await service.getSession(userId)).toBeNull();
  });

  it('updateSession throws for non-existent session', async () => {
    const userId = UserId.generate();
    await expect(service.updateSession(userId, { language: 'es' })).rejects.toThrow(
      'Session not found',
    );
  });
});
