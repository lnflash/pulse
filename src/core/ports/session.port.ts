import { UserId } from '../types';

export interface Session {
  userId: UserId;
  flashAuthToken?: string;
  flashUserId?: string;
  linkedPhone?: string;
  voiceSettings?: Record<string, unknown>;
  language?: string;
  lastActivity: Date;
  conversationContext?: Record<string, unknown>;
  onboardingSkipped?: boolean;
}

export interface SessionPort {
  getSession(userId: UserId): Promise<Session | null>;
  getOrCreateSession(userId: UserId): Promise<Session>;
  updateSession(userId: UserId, update: Partial<Session>): Promise<void>;
  deleteSession(userId: UserId): Promise<void>;
}
