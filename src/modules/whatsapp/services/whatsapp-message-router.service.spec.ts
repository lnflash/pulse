import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppMessageRouter } from './whatsapp-message-router.service';
import { WhatsAppInstanceManager } from './whatsapp-instance-manager.service';
import { WhatsappService } from './whatsapp.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Message } from 'whatsapp-web.js';

describe('WhatsAppMessageRouter', () => {
  let service: WhatsAppMessageRouter;
  let instanceManager: jest.Mocked<WhatsAppInstanceManager>;
  let whatsappService: jest.Mocked<WhatsappService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppMessageRouter,
        {
          provide: WhatsAppInstanceManager,
          useValue: {
            getInstance: jest.fn(),
            getAllInstances: jest.fn(),
          },
        },
        {
          provide: WhatsappService,
          useValue: {
            processCloudMessage: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsAppMessageRouter>(WhatsAppMessageRouter);
    instanceManager = module.get(WhatsAppInstanceManager);
    whatsappService = module.get(WhatsappService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('vCard Parsing', () => {
    it('should parse vCard with full name and phone', () => {
      const vCardData = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
TEL:+1234567890
END:VCARD`;

      const result = (service as any).parseVCard(vCardData);

      expect(result).toEqual({
        name: 'John Doe',
        phone: '1234567890',
      });
    });

    it('should parse vCard with TEL;TYPE format', () => {
      const vCardData = `BEGIN:VCARD
VERSION:3.0
FN:Alice Smith
TEL;TYPE=CELL:+9876543210
END:VCARD`;

      const result = (service as any).parseVCard(vCardData);

      expect(result).toEqual({
        name: 'Alice Smith',
        phone: '9876543210',
      });
    });

    it('should handle vCard without phone number', () => {
      const vCardData = `BEGIN:VCARD
VERSION:3.0
FN:Bob Johnson
EMAIL:bob@example.com
END:VCARD`;

      const result = (service as any).parseVCard(vCardData);

      expect(result).toBeNull();
    });

    it('should handle vCard without name', () => {
      const vCardData = `BEGIN:VCARD
VERSION:3.0
TEL:+5555551234
END:VCARD`;

      const result = (service as any).parseVCard(vCardData);

      expect(result).toBeNull();
    });

    it('should clean phone numbers properly', () => {
      const vCardData = `BEGIN:VCARD
VERSION:3.0
FN:Test User
TEL:+1 (555) 123-4567
END:VCARD`;

      const result = (service as any).parseVCard(vCardData);

      expect(result).toEqual({
        name: 'Test User',
        phone: '15551234567',
      });
    });
  });

  describe('handleIncomingMessage', () => {
    it('should extract vCard data from message', async () => {
      const mockMessage = {
        from: '1234567890@c.us',
        body: `BEGIN:VCARD
VERSION:3.0
FN:Contact Name
TEL:+9876543210
END:VCARD`,
        id: { _serialized: 'msg123' },
        timestamp: 1234567890,
        type: 'vcard',
        hasMedia: true,
        _data: {
          notifyName: 'Sender Name',
        },
      } as any as Message;

      whatsappService.processCloudMessage.mockResolvedValue('Contact saved!');

      await service.handleIncomingMessage({
        phoneNumber: '1234567890',
        message: mockMessage,
      });

      expect(whatsappService.processCloudMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'vcard',
          isVCard: true,
          vCard: {
            name: 'Contact Name',
            phone: '9876543210',
          },
        })
      );
    });

    it('should handle regular messages without vCard', async () => {
      const mockMessage = {
        from: '1234567890@c.us',
        body: 'Hello world',
        id: { _serialized: 'msg123' },
        timestamp: 1234567890,
        type: 'chat',
        hasMedia: false,
      } as any as Message;

      whatsappService.processCloudMessage.mockResolvedValue('Response');

      await service.handleIncomingMessage({
        phoneNumber: '1234567890',
        message: mockMessage,
      });

      expect(whatsappService.processCloudMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello world',
          messageType: 'chat',
        })
      );
      
      // Verify vCard properties are not present
      const callArgs = whatsappService.processCloudMessage.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('isVCard');
      expect(callArgs).not.toHaveProperty('vCard');
    });
  });
});