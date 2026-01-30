import { Injectable, Logger, Inject } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { MESSAGE_TRANSPORT } from '../../../core/ports/tokens';
import { MessageTransport } from '../../../core/ports/message-transport.port';
import {
  OutboundMessage,
  OutboundTextContent,
  FormattedText,
  ChatId,
  Platform,
} from '../../../core/types';

export interface SystemStatus {
  uptime: number;
  connectedUsers: number;
  totalSessions: number;
  activeSessions: number;
  redisConnected: boolean;
  timestamp: Date;
}

export interface UserLookup {
  sessionId: string;
  phoneNumber: string;
  flashUserId?: string;
  isVerified: boolean;
  createdAt: Date;
  lastActivity: Date;
}

export interface MessageStats {
  totalMessages: number;
  messagesByIntent: Record<string, number>;
  last24Hours: number;
}

export interface BroadcastRequest {
  message: string;
  targetUsers?: string[];
  platform?: Platform;
}

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly redisService: RedisService,
    @Inject(MESSAGE_TRANSPORT) private readonly messageTransport: MessageTransport,
  ) {}

  async getSystemStatus(): Promise<SystemStatus> {
    const uptime = Date.now() - this.startTime;
    const sessions = await this.getAllSessions();
    const activeSessions = sessions.filter((s) => s.isVerified).length;

    return {
      uptime,
      connectedUsers: sessions.length,
      totalSessions: sessions.length,
      activeSessions,
      redisConnected: true,
      timestamp: new Date(),
    };
  }

  async getUserInfo(userId: string): Promise<UserLookup | null> {
    const sessionKey = `session:${userId}`;
    const data = await this.redisService.get(sessionKey);

    if (!data) {
      return null;
    }

    const session = JSON.parse(data);

    return {
      sessionId: session.sessionId,
      phoneNumber: session.phoneNumber,
      flashUserId: session.flashUserId,
      isVerified: session.isVerified,
      createdAt: new Date(session.createdAt),
      lastActivity: new Date(session.lastActivity),
    };
  }

  async getMessageStats(): Promise<MessageStats> {
    const stats: MessageStats = {
      totalMessages: 0,
      messagesByIntent: {},
      last24Hours: 0,
    };

    const pattern = 'message:*';
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, matchedKeys] = await this.redisService.scan(cursor, pattern, 100);
      keys.push(...matchedKeys);
      cursor = nextCursor;
    } while (cursor !== '0');

    stats.totalMessages = keys.length;

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const key of keys) {
      const data = await this.redisService.get(key);
      if (data) {
        const message = JSON.parse(data);
        if (message.timestamp > oneDayAgo) {
          stats.last24Hours++;
        }
        if (message.intent) {
          stats.messagesByIntent[message.intent] =
            (stats.messagesByIntent[message.intent] || 0) + 1;
        }
      }
    }

    return stats;
  }

  async broadcastMessage(request: BroadcastRequest): Promise<{ sent: number; failed: number }> {
    const sessions = await this.getAllSessions();
    let sent = 0;
    let failed = 0;

    const targetSessions = request.targetUsers
      ? sessions.filter((s) => request.targetUsers!.includes(s.phoneNumber))
      : sessions.filter((s) => s.isVerified);

    for (const session of targetSessions) {
      try {
        const formattedText: FormattedText = [
          { type: 'text', value: '📢 ' },
          { type: 'bold', value: 'System Announcement' },
          { type: 'newline' },
          { type: 'newline' },
          { type: 'text', value: request.message },
        ];

        const content: OutboundTextContent = {
          type: 'text',
          body: formattedText,
        };

        const platform = request.platform || Platform.WhatsAppCloud;

        const outboundMessage: OutboundMessage = {
          to: ChatId.create({
            platform,
            platformChatId: session.phoneNumber,
            isGroup: false,
          }),
          content,
        };

        await this.messageTransport.publishOutbound(outboundMessage);
        sent++;
      } catch (error) {
        this.logger.error(`Failed to send broadcast to ${session.phoneNumber}:`, error);
        failed++;
      }
    }

    this.logger.log(`Broadcast complete: ${sent} sent, ${failed} failed`);

    return { sent, failed };
  }

  private async getAllSessions(): Promise<any[]> {
    const sessions: any[] = [];
    const pattern = 'session:*';
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, matchedKeys] = await this.redisService.scan(cursor, pattern, 100);
      keys.push(...matchedKeys);
      cursor = nextCursor;
    } while (cursor !== '0');

    for (const key of keys) {
      const data = await this.redisService.get(key);
      if (data) {
        try {
          sessions.push(JSON.parse(data));
        } catch {
          continue;
        }
      }
    }

    return sessions;
  }
}
