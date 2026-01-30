import { Test, TestingModule } from '@nestjs/testing';
import { ConversationService, AI_CONVERSATION_PORT } from '../services/conversation.service';
import { AIConversationPort } from '@app/core/ports';

describe('ConversationService', () => {
  let service: ConversationService;
  let mockAdapter: jest.Mocked<AIConversationPort>;

  beforeEach(async () => {
    mockAdapter = {
      respond: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ConversationService, { provide: AI_CONVERSATION_PORT, useValue: mockAdapter }],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chat', () => {
    it('should send message and return AI response', async () => {
      mockAdapter.respond.mockResolvedValue('Hello! I can help with Flash.');

      const result = await service.chat('user-1', 'Hi there');

      expect(result).toBe('Hello! I can help with Flash.');
      expect(mockAdapter.respond).toHaveBeenCalledWith('Hi there', [
        { role: 'user', content: 'Hi there' },
      ]);
    });

    it('should maintain conversation history across calls', async () => {
      mockAdapter.respond
        .mockResolvedValueOnce('First response')
        .mockResolvedValueOnce('Second response');

      await service.chat('user-1', 'First message');
      await service.chat('user-1', 'Second message');

      expect(mockAdapter.respond).toHaveBeenLastCalledWith(
        'Second message',
        expect.arrayContaining([
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
          { role: 'user', content: 'Second message' },
        ]),
      );
    });

    it('should isolate history between users', async () => {
      mockAdapter.respond.mockResolvedValue('Response');

      await service.chat('user-1', 'Message from user 1');
      await service.chat('user-2', 'Message from user 2');

      expect(mockAdapter.respond).toHaveBeenNthCalledWith(2, 'Message from user 2', [
        { role: 'user', content: 'Message from user 2' },
      ]);
    });

    it('should trim history to last 10 messages', async () => {
      mockAdapter.respond.mockResolvedValue('OK');

      for (let i = 0; i < 8; i++) {
        await service.chat('user-1', `Message ${i}`);
      }

      const history = service.getHistory('user-1');
      expect(history.length).toBeLessThanOrEqual(10);
    });

    it('should return fallback on adapter error', async () => {
      mockAdapter.respond.mockRejectedValue(new Error('API down'));

      const result = await service.chat('user-1', 'Hello');

      expect(result).toBe('Something went wrong. Please try again.');
    });
  });

  describe('clearHistory', () => {
    it('should clear user conversation history', async () => {
      mockAdapter.respond.mockResolvedValue('Response');

      await service.chat('user-1', 'Hello');
      service.clearHistory('user-1');

      expect(service.getHistory('user-1')).toEqual([]);
    });
  });

  describe('getHistory', () => {
    it('should return empty array for unknown user', () => {
      expect(service.getHistory('unknown')).toEqual([]);
    });
  });
});
