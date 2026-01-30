import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { IdentityPort } from '../../../core/ports/identity.port';
import { ActorId, UserId } from '../../../core/types';

@Injectable()
export class IdentityService implements IdentityPort {
  private readonly logger = new Logger(IdentityService.name);

  constructor(private readonly redis: RedisService) {}

  private identityKey(actor: ActorId): string {
    return `identity:${actor.platform}:${actor.platformUserId}`;
  }

  async resolveUserId(actor: ActorId): Promise<UserId | null> {
    const key = this.identityKey(actor);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    return UserId.create(raw);
  }

  async createMapping(actor: ActorId): Promise<UserId> {
    const existing = await this.resolveUserId(actor);
    if (existing) return existing;

    const userId = UserId.generate();
    const key = this.identityKey(actor);
    await this.redis.set(key, userId.value);
    this.logger.log(
      `Created identity mapping: ${actor.platform}:${actor.platformUserId} -> ${userId.value}`,
    );
    return userId;
  }

  async getActors(userId: UserId): Promise<ActorId[]> {
    const actors: ActorId[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'identity:*', 100);
      cursor = nextCursor;

      for (const key of keys) {
        const storedUserId = await this.redis.get(key);
        if (storedUserId === userId.value) {
          const parts = key.split(':');
          if (parts.length >= 3) {
            const platform = parts[1];
            const platformUserId = parts.slice(2).join(':');
            actors.push(
              ActorId.create({
                platform: platform as any,
                platformUserId,
              }),
            );
          }
        }
      }
    } while (cursor !== '0');

    return actors;
  }
}
