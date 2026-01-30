import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiAdapter } from '../adapters/gemini.adapter';

jest.mock('@google/generative-ai', () => {
  const mockSendMessage = jest.fn();
  const mockStartChat = jest.fn(() => ({ sendMessage: mockSendMessage }));
  const mockGetGenerativeModel = jest.fn(() => ({ startChat: mockStartChat }));

  return {
    GoogleGenerativeAI: jest.fn(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
    HarmCategory: {
      HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
      HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
      HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    },
    HarmBlockThreshold: {
      BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    __mockSendMessage: mockSendMessage,
    __mockStartChat: mockStartChat,
  };
});

const { __mockSendMessage, __mockStartChat } = jest.requireMock('@google/generative-ai');

describe('GeminiAdapter', () => {
  let adapter: GeminiAdapter;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'geminiAi.apiKey') return 'test-api-key';
              if (key === 'ai.model') return 'gemini-pro';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<GeminiAdapter>(GeminiAdapter);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('respond', () => {
    it('should return AI response for a prompt', async () => {
      __mockSendMessage.mockResolvedValue({
        response: { text: () => 'Flash is a Bitcoin Lightning wallet.' },
      });

      const result = await adapter.respond('What is Flash?', []);

      expect(result).toBe('Flash is a Bitcoin Lightning wallet.');
      expect(__mockStartChat).toHaveBeenCalled();
    });

    it('should pass formatted history to chat', async () => {
      __mockSendMessage.mockResolvedValue({
        response: { text: () => 'You can send BTC.' },
      });

      await adapter.respond('How do I send?', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);

      expect(__mockStartChat).toHaveBeenCalledWith(
        expect.objectContaining({
          history: [
            { role: 'user', parts: [{ text: 'Hello' }] },
            { role: 'model', parts: [{ text: 'Hi there!' }] },
          ],
        }),
      );
    });

    it('should sanitize output containing sensitive patterns', async () => {
      __mockSendMessage.mockResolvedValue({
        response: { text: () => 'The api_key is sk-12345' },
      });

      const result = await adapter.respond('Tell me secrets', []);

      expect(result).toBe(
        'I can help you with Flash and Bitcoin questions. What would you like to know?',
      );
    });

    it('should handle empty response from model', async () => {
      __mockSendMessage.mockResolvedValue({
        response: { text: () => '' },
      });

      const result = await adapter.respond('Hello', []);

      expect(result).toBe("I couldn't generate a response. Please try rephrasing your question.");
    });

    it('should handle API errors gracefully', async () => {
      __mockSendMessage.mockRejectedValue(new Error('Network error'));

      const result = await adapter.respond('Hello', []);

      expect(result).toBe(
        'Something went wrong. Please try again or type "help" for available commands.',
      );
    });
  });

  describe('when API key is missing', () => {
    it('should return unavailable message', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GeminiAdapter,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => undefined),
            },
          },
        ],
      }).compile();

      const noKeyAdapter = module.get<GeminiAdapter>(GeminiAdapter);
      const result = await noKeyAdapter.respond('Hello', []);

      expect(result).toContain('currently unavailable');
    });
  });
});
