import { Test } from '@nestjs/testing';
import { IdentityService } from '../services/identity.service';
import { RedisService } from '../../../common/redis/redis.service';
import { ActorId, UserId } from '../../../core/types';
import { Platform } from '../../../core/types/platform';

describe('IdentityService', () => {
  let service: IdentityService;
  let store: Map<string, string>;

  beforeEach(async () => {
    store = new Map();

    const mockRedis = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      scan: jest.fn((cursor: string, _pattern: string, _count: number) => {
        const keys = Array.from(store.keys()).filter((k) => k.startsWith('identity:'));
        return Promise.resolve(['0', keys] as [string, string[]]);
      }),
    };

    const module = await Test.createTestingModule({
      providers: [IdentityService, { provide: RedisService, useValue: mockRedis }],
    }).compile();

    service = module.get(IdentityService);
  });

  const makeActor = (platform: Platform, id: string) =>
    ActorId.create({ platform, platformUserId: id });

  it('resolveUserId returns null for unknown actor', async () => {
    const actor = makeActor(Platform.WhatsAppCloud, 'unknown');
    expect(await service.resolveUserId(actor)).toBeNull();
  });

  it('createMapping returns same UserId for same actor (idempotent)', async () => {
    const actor = makeActor(Platform.WhatsAppCloud, '18765551234');
    const first = await service.createMapping(actor);
    const second = await service.createMapping(actor);
    expect(first.value).toBe(second.value);
  });

  it('resolveUserId returns UserId after createMapping', async () => {
    const actor = makeActor(Platform.Telegram, 'tg123');
    const created = await service.createMapping(actor);
    const resolved = await service.resolveUserId(actor);
    expect(resolved).not.toBeNull();
    expect(resolved!.value).toBe(created.value);
  });

  it('different actors get different UserIds', async () => {
    const a1 = makeActor(Platform.WhatsAppCloud, 'user1');
    const a2 = makeActor(Platform.Telegram, 'user2');
    const id1 = await service.createMapping(a1);
    const id2 = await service.createMapping(a2);
    expect(id1.value).not.toBe(id2.value);
  });

  it('getActors returns all actors for a userId', async () => {
    const actor = makeActor(Platform.WhatsAppCloud, '18765551234');
    const userId = await service.createMapping(actor);
    const actors = await service.getActors(userId);
    expect(actors).toHaveLength(1);
    expect(actors[0].platform).toBe(Platform.WhatsAppCloud);
    expect(actors[0].platformUserId).toBe('18765551234');
  });

  it('getActors returns empty array for unknown userId', async () => {
    const userId = UserId.generate();
    const actors = await service.getActors(userId);
    expect(actors).toHaveLength(0);
  });
});
