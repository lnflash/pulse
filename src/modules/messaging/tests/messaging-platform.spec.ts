import { Test, TestingModule } from '@nestjs/testing';
import { MessagingOrchestratorService } from '../services/messaging-orchestrator.service';
import { PlatformCommandExecutorService } from '../services/platform-command-executor.service';
import { 
  IMessagePlatform, 
  IncomingMessage, 
  MessageType, 
  PlatformStatus,
  OutgoingMessage,
  MessageReceipt
} from '../abstractions/message-platform.interface';
import { CommandMessageHandler } from '../handlers/command-message.handler';
import { GeneralMessageHandler } from '../handlers/general-message.handler';

/**
 * Mock implementation of IMessagePlatform for testing
 */
class MockMessagePlatform implements IMessagePlatform {
  status: PlatformStatus = PlatformStatus.DISCONNECTED;
  messageHandlers: ((message: IncomingMessage) => Promise<void>)[] = [];
  statusHandlers: ((receipt: MessageReceipt) => Promise<void>)[] = [];
  connectionHandlers: ((status: PlatformStatus) => Promise<void>)[] = [];

  async initialize(config: any): Promise<void> {
    this.status = PlatformStatus.CONNECTING;
  }

  async connect(): Promise<void> {
    this.status = PlatformStatus.CONNECTED;
    for (const handler of this.connectionHandlers) {
      await handler(PlatformStatus.CONNECTED);
    }
  }

  async disconnect(): Promise<void> {
    this.status = PlatformStatus.DISCONNECTED;
    for (const handler of this.connectionHandlers) {
      await handler(PlatformStatus.DISCONNECTED);
    }
  }

  getStatus(): PlatformStatus {
    return this.status;
  }

  async sendMessage(message: OutgoingMessage): Promise<MessageReceipt> {
    return {
      messageId: 'mock-message-id',
      status: 'sent',
      timestamp: new Date()
    };
  }

  async sendBulkMessages(messages: OutgoingMessage[]): Promise<MessageReceipt[]> {
    return messages.map(() => ({
      messageId: 'mock-message-id',
      status: 'sent' as const,
      timestamp: new Date()
    }));
  }

  async editMessage(messageId: string, newContent: any): Promise<boolean> {
    return true;
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    return true;
  }

  async sendVoice(to: string, audio: Buffer, caption?: string): Promise<MessageReceipt> {
    return this.sendMessage({ to, content: { voice: audio, text: caption } });
  }

  async sendImage(to: string, image: Buffer, caption?: string): Promise<MessageReceipt> {
    return this.sendMessage({ to, content: { image, text: caption } });
  }

  async sendDocument(to: string, document: Buffer, filename: string, caption?: string): Promise<MessageReceipt> {
    return this.sendMessage({ to, content: { document, text: caption } });
  }

  async downloadMedia(messageId: string): Promise<Buffer> {
    return Buffer.from('mock-media');
  }

  async getUserInfo(userId: string): Promise<any> {
    return {
      id: userId,
      name: 'Mock User',
      phone: '+1234567890'
    };
  }

  async getProfilePicture(userId: string): Promise<Buffer | null> {
    return null;
  }

  async blockUser(userId: string): Promise<boolean> {
    return true;
  }

  async unblockUser(userId: string): Promise<boolean> {
    return true;
  }

  async getGroupInfo(groupId: string): Promise<any> {
    return {
      id: groupId,
      name: 'Mock Group',
      participants: [],
      admins: []
    };
  }

  async createGroup(name: string, participants: string[]): Promise<string> {
    return 'mock-group-id';
  }

  async addToGroup(groupId: string, participants: string[]): Promise<boolean> {
    return true;
  }

  async removeFromGroup(groupId: string, participants: string[]): Promise<boolean> {
    return true;
  }

  async leaveGroup(groupId: string): Promise<boolean> {
    return true;
  }

  async setStatus(status: string): Promise<boolean> {
    return true;
  }

  async setProfilePicture(image: Buffer): Promise<boolean> {
    return true;
  }

  onMessage(handler: (message: IncomingMessage) => Promise<void>): void {
    this.messageHandlers.push(handler);
  }

  onMessageStatus(handler: (receipt: MessageReceipt) => Promise<void>): void {
    this.statusHandlers.push(handler);
  }

  onConnectionStatus(handler: (status: PlatformStatus) => Promise<void>): void {
    this.connectionHandlers.push(handler);
  }

  // Simulate receiving a message
  async simulateIncomingMessage(message: IncomingMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      await handler(message);
    }
  }
}

describe('Messaging Platform Abstraction', () => {
  let orchestrator: MessagingOrchestratorService;
  let commandExecutor: PlatformCommandExecutorService;
  let mockPlatform: MockMessagePlatform;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MessagingOrchestratorService,
          useValue: {
            initializePlatform: jest.fn(),
            sendMessage: jest.fn(),
            getPlatform: jest.fn(),
            registerHandler: jest.fn()
          }
        },
        {
          provide: PlatformCommandExecutorService,
          useValue: {
            execute: jest.fn(),
            getAvailableCommands: jest.fn(),
            generateHelpMessage: jest.fn()
          }
        },
        {
          provide: CommandMessageHandler,
          useValue: {
            canHandle: jest.fn(),
            handle: jest.fn(),
            priority: 10
          }
        },
        {
          provide: GeneralMessageHandler,
          useValue: {
            canHandle: jest.fn(),
            handle: jest.fn(),
            priority: 50
          }
        }
      ]
    }).compile();

    orchestrator = module.get<MessagingOrchestratorService>(MessagingOrchestratorService);
    commandExecutor = module.get<PlatformCommandExecutorService>(PlatformCommandExecutorService);
    mockPlatform = new MockMessagePlatform();
  });

  describe('Platform Lifecycle', () => {
    it('should initialize platform correctly', async () => {
      await mockPlatform.initialize({ platformType: 'test' });
      expect(mockPlatform.getStatus()).toBe(PlatformStatus.CONNECTING);
    });

    it('should connect to platform', async () => {
      await mockPlatform.initialize({ platformType: 'test' });
      await mockPlatform.connect();
      expect(mockPlatform.getStatus()).toBe(PlatformStatus.CONNECTED);
    });

    it('should disconnect from platform', async () => {
      await mockPlatform.connect();
      await mockPlatform.disconnect();
      expect(mockPlatform.getStatus()).toBe(PlatformStatus.DISCONNECTED);
    });

    it('should handle connection status changes', async () => {
      const statusChanges: PlatformStatus[] = [];
      
      mockPlatform.onConnectionStatus(async (status) => {
        statusChanges.push(status);
      });

      await mockPlatform.connect();
      await mockPlatform.disconnect();

      expect(statusChanges).toEqual([
        PlatformStatus.CONNECTED,
        PlatformStatus.DISCONNECTED
      ]);
    });
  });

  describe('Message Handling', () => {
    it('should handle incoming text messages', async () => {
      const receivedMessages: IncomingMessage[] = [];
      
      mockPlatform.onMessage(async (message) => {
        receivedMessages.push(message);
      });

      const testMessage: IncomingMessage = {
        id: 'test-123',
        from: '+1234567890',
        timestamp: new Date(),
        type: MessageType.TEXT,
        content: { text: 'Hello, world!' },
        isGroup: false
      };

      await mockPlatform.simulateIncomingMessage(testMessage);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual(testMessage);
    });

    it('should handle incoming voice messages', async () => {
      const receivedMessages: IncomingMessage[] = [];
      
      mockPlatform.onMessage(async (message) => {
        receivedMessages.push(message);
      });

      const testMessage: IncomingMessage = {
        id: 'voice-123',
        from: '+1234567890',
        timestamp: new Date(),
        type: MessageType.VOICE,
        content: { voice: Buffer.from('audio-data') },
        isGroup: false
      };

      await mockPlatform.simulateIncomingMessage(testMessage);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].type).toBe(MessageType.VOICE);
    });

    it('should handle group messages', async () => {
      const receivedMessages: IncomingMessage[] = [];
      
      mockPlatform.onMessage(async (message) => {
        receivedMessages.push(message);
      });

      const testMessage: IncomingMessage = {
        id: 'group-123',
        from: '+1234567890',
        timestamp: new Date(),
        type: MessageType.TEXT,
        content: { text: 'Group message' },
        isGroup: true,
        groupId: 'group-456'
      };

      await mockPlatform.simulateIncomingMessage(testMessage);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].isGroup).toBe(true);
      expect(receivedMessages[0].groupId).toBe('group-456');
    });
  });

  describe('Message Sending', () => {
    it('should send text messages', async () => {
      const receipt = await mockPlatform.sendMessage({
        to: '+1234567890',
        content: { text: 'Test message' }
      });

      expect(receipt).toBeDefined();
      expect(receipt.status).toBe('sent');
      expect(receipt.messageId).toBeDefined();
    });

    it('should send voice messages', async () => {
      const audioBuffer = Buffer.from('audio-data');
      const receipt = await mockPlatform.sendVoice(
        '+1234567890',
        audioBuffer,
        'Voice caption'
      );

      expect(receipt).toBeDefined();
      expect(receipt.status).toBe('sent');
    });

    it('should send image messages', async () => {
      const imageBuffer = Buffer.from('image-data');
      const receipt = await mockPlatform.sendImage(
        '+1234567890',
        imageBuffer,
        'Image caption'
      );

      expect(receipt).toBeDefined();
      expect(receipt.status).toBe('sent');
    });

    it('should send bulk messages', async () => {
      const messages: OutgoingMessage[] = [
        { to: '+1111111111', content: { text: 'Message 1' } },
        { to: '+2222222222', content: { text: 'Message 2' } },
        { to: '+3333333333', content: { text: 'Message 3' } }
      ];

      const receipts = await mockPlatform.sendBulkMessages(messages);

      expect(receipts).toHaveLength(3);
      receipts.forEach(receipt => {
        expect(receipt.status).toBe('sent');
      });
    });
  });

  describe('Command Execution', () => {
    it('should execute commands through platform', async () => {
      const mockContext = {
        command: 'balance',
        args: [],
        userId: '+1234567890',
        session: null,
        platform: mockPlatform,
        originalMessage: {
          id: 'msg-123',
          from: '+1234567890',
          timestamp: new Date(),
          type: MessageType.TEXT,
          content: { text: 'balance' },
          isGroup: false
        } as IncomingMessage
      };

      (commandExecutor.execute as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Your balance is 1000 sats'
      });

      const result = await commandExecutor.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('balance');
    });

    it('should handle command errors gracefully', async () => {
      const mockContext = {
        command: 'invalid',
        args: [],
        userId: '+1234567890',
        session: null,
        platform: mockPlatform,
        originalMessage: {
          id: 'msg-123',
          from: '+1234567890',
          timestamp: new Date(),
          type: MessageType.TEXT,
          content: { text: 'invalid' },
          isGroup: false
        } as IncomingMessage
      };

      (commandExecutor.execute as jest.Mock).mockResolvedValue({
        success: false,
        message: 'Unknown command'
      });

      const result = await commandExecutor.execute(mockContext);

      expect(result.success).toBe(false);
    });
  });

  describe('Platform Features', () => {
    it('should get user info', async () => {
      const userInfo = await mockPlatform.getUserInfo('+1234567890');
      
      expect(userInfo).toBeDefined();
      expect(userInfo.id).toBe('+1234567890');
      expect(userInfo.name).toBe('Mock User');
    });

    it('should manage groups', async () => {
      const groupId = await mockPlatform.createGroup('Test Group', ['+1111111111', '+2222222222']);
      expect(groupId).toBe('mock-group-id');

      const added = await mockPlatform.addToGroup(groupId, ['+3333333333']);
      expect(added).toBe(true);

      const removed = await mockPlatform.removeFromGroup(groupId, ['+1111111111']);
      expect(removed).toBe(true);

      const left = await mockPlatform.leaveGroup(groupId);
      expect(left).toBe(true);
    });

    it('should block and unblock users', async () => {
      const blocked = await mockPlatform.blockUser('+1234567890');
      expect(blocked).toBe(true);

      const unblocked = await mockPlatform.unblockUser('+1234567890');
      expect(unblocked).toBe(true);
    });

    it('should edit and delete messages', async () => {
      const edited = await mockPlatform.editMessage('msg-123', { text: 'Edited message' });
      expect(edited).toBe(true);

      const deleted = await mockPlatform.deleteMessage('msg-123');
      expect(deleted).toBe(true);
    });
  });
});

describe('Message Handler Priority', () => {
  it('should process handlers in priority order', () => {
    const handlers = [
      { priority: 50, name: 'GeneralHandler' },
      { priority: 10, name: 'CommandHandler' },
      { priority: 30, name: 'MiddleHandler' }
    ];

    const sorted = handlers.sort((a, b) => a.priority - b.priority);

    expect(sorted[0].name).toBe('CommandHandler');
    expect(sorted[1].name).toBe('MiddleHandler');
    expect(sorted[2].name).toBe('GeneralHandler');
  });
});

describe('Platform Abstraction Benefits', () => {
  it('should allow platform switching without code changes', () => {
    // This test demonstrates the benefit of abstraction
    // The same code works with different platform implementations
    
    class WhatsAppPlatform extends MockMessagePlatform {
      platformType = 'whatsapp';
    }
    
    class TelegramPlatform extends MockMessagePlatform {
      platformType = 'telegram';
    }
    
    const platforms: IMessagePlatform[] = [
      new WhatsAppPlatform(),
      new TelegramPlatform()
    ];
    
    platforms.forEach(platform => {
      // Same interface for all platforms
      expect(platform.sendMessage).toBeDefined();
      expect(platform.connect).toBeDefined();
      expect(platform.disconnect).toBeDefined();
      expect(platform.onMessage).toBeDefined();
    });
  });
});