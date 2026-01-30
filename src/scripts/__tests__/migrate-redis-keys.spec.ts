import {
  extractPhoneNumber,
  isUuid,
  safeJsonParse,
  scanKeys,
  migrateRedisKeys,
  RedisLike,
  MigrationOptions,
  SessionData,
} from '../migrate-redis-keys';

function createMockRedis(
  store: Record<string, string> = {},
): RedisLike & { store: Record<string, string> } {
  const ttls: Record<string, number> = {};

  return {
    store,

    async scan(cursor: string | number): Promise<[string, string[]]> {
      if (String(cursor) !== '0') return ['0', []];
      const keys = Object.keys(store).filter((k) => k.startsWith('session:'));
      return ['0', keys];
    },

    async get(key: string): Promise<string | null> {
      return store[key] ?? null;
    },

    async set(key: string, value: string, ...args: Array<string | number>): Promise<unknown> {
      store[key] = value;
      if (args[0] === 'EX') ttls[key] = args[1] as number;
      return 'OK';
    },

    async ttl(key: string): Promise<number> {
      return ttls[key] ?? -1;
    },

    async quit(): Promise<unknown> {
      return 'OK';
    },
  };
}

function sessionJson(data: Partial<SessionData>): string {
  return JSON.stringify({
    sessionId: 'abc123',
    whatsappId: '18765551234@c.us',
    phoneNumber: '18765551234',
    isVerified: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...data,
  });
}

describe('extractPhoneNumber', () => {
  it('extracts phone from @c.us format', () => {
    expect(extractPhoneNumber('18765551234@c.us')).toBe('18765551234');
  });

  it('extracts phone from @lid format', () => {
    expect(extractPhoneNumber('18765551234@lid')).toBe('18765551234');
  });

  it('returns null for empty string', () => {
    expect(extractPhoneNumber('')).toBeNull();
  });

  it('returns null for non-numeric prefix', () => {
    expect(extractPhoneNumber('abc@c.us')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(extractPhoneNumber(null as unknown as string)).toBeNull();
    expect(extractPhoneNumber(undefined as unknown as string)).toBeNull();
  });
});

describe('isUuid', () => {
  it('matches valid UUID v4', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects non-UUID strings', () => {
    expect(isUuid('abc123')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON object', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for invalid JSON', () => {
    expect(safeJsonParse('not-json')).toBeNull();
  });

  it('returns null for JSON primitives', () => {
    expect(safeJsonParse('"hello"')).toBeNull();
    expect(safeJsonParse('42')).toBeNull();
  });
});

describe('scanKeys', () => {
  it('collects all keys from SCAN iterations', async () => {
    let callCount = 0;
    const mockRedis: RedisLike = {
      async scan(): Promise<[string, string[]]> {
        callCount++;
        if (callCount === 1) return ['1', ['session:a']];
        return ['0', ['session:b']];
      },
      async get() {
        return null;
      },
      async set() {
        return 'OK';
      },
      async ttl() {
        return -1;
      },
      async quit() {
        return 'OK';
      },
    };

    const keys = await scanKeys(mockRedis, 'session:*', 10);
    expect(keys).toEqual(['session:a', 'session:b']);
  });
});

describe('migrateRedisKeys', () => {
  it('migrates a valid session and creates identity', async () => {
    const store: Record<string, string> = {
      'session:abc123': sessionJson({}),
    };
    const redis = createMockRedis(store);

    const stats = await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });

    expect(stats.migrated).toBe(1);
    expect(stats.identitiesCreated).toBe(1);
    expect(stats.errors).toBe(0);

    const identityKey = Object.keys(store).find((k) => k.startsWith('identity:whatsapp-cloud:'));
    expect(identityKey).toBe('identity:whatsapp-cloud:18765551234');

    const userId = store[identityKey!];
    expect(isUuid(userId)).toBe(true);
    expect(store[`session:${userId}`]).toBeDefined();
  });

  it('skips sessions already in UUID format', async () => {
    const store: Record<string, string> = {
      'session:550e8400-e29b-41d4-a716-446655440000': sessionJson({}),
    };
    const redis = createMockRedis(store);

    const stats = await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });

    expect(stats.skipped).toBe(1);
    expect(stats.migrated).toBe(0);
  });

  it('skips empty/expired sessions', async () => {
    const redis = createMockRedis({ 'session:old1': '' });
    const origGet = redis.get.bind(redis);
    redis.get = async (key: string) => {
      if (key === 'session:old1') return null;
      return origGet(key);
    };

    const stats = await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });

    expect(stats.skipped).toBe(1);
    expect(stats.migrated).toBe(0);
  });

  it('skips unparseable (encrypted) sessions', async () => {
    const redis = createMockRedis({
      'session:enc1': 'aes256:garbled-encrypted-data',
    });

    const stats = await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });

    expect(stats.skipped).toBe(1);
    expect(stats.migrated).toBe(0);
  });

  it('skips sessions without whatsappId or phoneNumber', async () => {
    const redis = createMockRedis({
      'session:nophone': JSON.stringify({ sessionId: 'nophone', isVerified: false }),
    });

    const stats = await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });

    expect(stats.skipped).toBe(1);
  });

  it('is idempotent — does not duplicate on second run', async () => {
    const store: Record<string, string> = {
      'session:abc123': sessionJson({}),
    };
    const redis = createMockRedis(store);

    const stats1 = await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });
    expect(stats1.migrated).toBe(1);

    const stats2 = await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });
    expect(stats2.migrated).toBe(0);
    expect(stats2.skipped).toBeGreaterThan(0);
  });

  it('dry-run mode does not write anything', async () => {
    const store: Record<string, string> = {
      'session:abc123': sessionJson({}),
    };
    const redis = createMockRedis(store);
    const keysBefore = Object.keys({ ...store });

    const stats = await migrateRedisKeys({ dryRun: true, scanCount: 100, redis });

    expect(stats.migrated).toBe(1);
    expect(stats.identitiesCreated).toBe(1);
    expect(Object.keys(redis.store)).toEqual(keysBefore);
  });

  it('handles read errors gracefully', async () => {
    const redis = createMockRedis({ 'session:fail1': 'data' });
    redis.get = async (key: string) => {
      if (key === 'session:fail1') throw new Error('Connection lost');
      return null;
    };

    const stats = await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });

    expect(stats.errors).toBe(1);
    expect(stats.migrated).toBe(0);
  });

  it('reuses userId for same phone number across sessions', async () => {
    const store: Record<string, string> = {
      'session:s1': sessionJson({ sessionId: 's1' }),
      'session:s2': sessionJson({ sessionId: 's2' }),
    };
    const redis = createMockRedis(store);

    const stats = await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });

    expect(stats.identitiesCreated).toBe(1);
    expect(stats.migrated).toBe(1);
    expect(stats.skipped).toBe(1);
  });

  it('uses phoneNumber field when whatsappId is missing', async () => {
    const store: Record<string, string> = {
      'session:pn1': JSON.stringify({ sessionId: 'pn1', phoneNumber: '18769990000' }),
    };
    const redis = createMockRedis(store);

    const stats = await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });

    expect(stats.migrated).toBe(1);
    expect(store['identity:whatsapp-cloud:18769990000']).toBeDefined();
  });

  it('preserves all session fields in migrated data', async () => {
    const original: SessionData = {
      sessionId: 'x1',
      whatsappId: '18761112222@c.us',
      phoneNumber: '18761112222',
      flashUserId: 'flash-123',
      flashAuthToken: 'token-secret',
      isVerified: true,
      createdAt: '2026-01-01T00:00:00Z',
      mfaVerified: false,
      consentGiven: true,
    };
    const store: Record<string, string> = {
      'session:x1': JSON.stringify(original),
    };
    const redis = createMockRedis(store);

    await migrateRedisKeys({ dryRun: false, scanCount: 100, redis });

    const userId = store['identity:whatsapp-cloud:18761112222'];
    const migrated = JSON.parse(store[`session:${userId}`]);
    expect(migrated.flashUserId).toBe('flash-123');
    expect(migrated.flashAuthToken).toBe('token-secret');
    expect(migrated.consentGiven).toBe(true);
  });
});
