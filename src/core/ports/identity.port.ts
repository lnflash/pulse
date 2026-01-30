import { ActorId, UserId } from '../types';

export interface IdentityPort {
  resolveUserId(actor: ActorId): Promise<UserId | null>;
  createMapping(actor: ActorId): Promise<UserId>;
  getActors(userId: UserId): Promise<ActorId[]>;
}
