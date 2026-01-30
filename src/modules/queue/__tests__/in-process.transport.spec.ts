import { InProcessTransport } from '../transports/in-process.transport';
import { Platform } from '../../../core/types';

describe('InProcessTransport', () => {
  let transport: InProcessTransport;

  beforeEach(() => {
    transport = new InProcessTransport();
  });

  it('should route inbound messages to handler', async () => {
    const handler = jest.fn();
    transport.onInbound(handler);

    const message: any = {
      id: '123',
      from: { platform: Platform.WhatsAppCloud, platformUserId: '1234' },
      chat: { platform: Platform.WhatsAppCloud, platformChatId: '1234', isGroup: false },
      timestamp: new Date(),
      content: { type: 'text', body: 'test' },
    };

    await transport.publishInbound(message);
    expect(handler).toHaveBeenCalledWith(message);
  });

  it('should route outbound messages to handler', async () => {
    const handler = jest.fn();
    transport.onOutbound(handler);

    const message: any = {
      to: { platform: Platform.WhatsAppCloud, platformChatId: '1234', isGroup: false },
      content: { type: 'text', body: [{ type: 'text', value: 'test' }] },
    };

    await transport.publishOutbound(message);
    expect(handler).toHaveBeenCalledWith(message);
  });
});
