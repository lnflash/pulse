import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { MessageOrchestratorService } from '../../src/modules/bot-core/orchestrator/message-orchestrator.service';
import { Platform, InboundMessage } from '../../src/core/types';

describe('Message Flow Integration', () => {
  let orchestrator: MessageOrchestratorService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    orchestrator = module.get(MessageOrchestratorService);
  });

  it('should process text message end-to-end', async () => {
    const inbound: InboundMessage = {
      id: 'test_123',
      from: {
        platform: Platform.WhatsAppCloud,
        platformUserId: '1234567890',
        displayName: 'Test User',
      },
      chat: {
        platform: Platform.WhatsAppCloud,
        platformChatId: '1234567890',
        isGroup: false,
      },
      timestamp: new Date(),
      content: {
        type: 'text',
        body: 'help',
      },
    };

    await expect(orchestrator.processMessage(inbound)).resolves.not.toThrow();
  });

  it('should handle balance command for authenticated user', async () => {
    const inbound: InboundMessage = {
      id: 'test_456',
      from: {
        platform: Platform.WhatsAppCloud,
        platformUserId: '1234567890',
      },
      chat: {
        platform: Platform.WhatsAppCloud,
        platformChatId: '1234567890',
        isGroup: false,
      },
      timestamp: new Date(),
      content: {
        type: 'text',
        body: 'balance',
      },
    };

    await expect(orchestrator.processMessage(inbound)).resolves.not.toThrow();
  });
});
