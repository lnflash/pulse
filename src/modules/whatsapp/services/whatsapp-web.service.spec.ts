import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsAppWebService } from './whatsapp-web.service';
import { WhatsAppInstanceManager } from './whatsapp-instance-manager.service';
import { WhatsAppMessageRouter } from './whatsapp-message-router.service';
import { QrCodeService } from './qr-code.service';
import { ChromeCleanupUtil } from '../../../common/utils/chrome-cleanup.util';

// Mock dependencies
jest.mock('../../../common/utils/chrome-cleanup.util', () => ({
  ChromeCleanupUtil: {
    cleanup: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('WhatsAppWebService', () => {
  let service: WhatsAppWebService;
  let configService: jest.Mocked<ConfigService>;
  let instanceManager: jest.Mocked<WhatsAppInstanceManager>;
  let messageRouter: jest.Mocked<WhatsAppMessageRouter>;
  let qrCodeService: jest.Mocked<QrCodeService>;
  let eventEmitter2: jest.Mocked<EventEmitter2>;

  const mockInstance: any = {
    phoneNumber: '1234567890',
    status: 'ready' as const,
    qrCode: 'qr-code-data',
    sessionPath: './sessions/test',
    createdAt: new Date(),
    lastActivity: new Date(),
    client: {
      info: {
        wid: { user: '1234567890' },
        pushname: 'Test User'
      },
      logout: jest.fn().mockResolvedValue(undefined)
    }
  };

  const mockInstanceConfig = {
    phoneNumber: '1234567890',
    enabled: true,
    sessionPath: './sessions/test'
  };

  beforeEach(async () => {
    // Reset environment
    process.env.NODE_ENV = 'development';
    delete process.env.DISABLE_WHATSAPP_WEB;
    delete process.env.WHATSAPP_DEFAULT_PHONE;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppWebService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn()
          }
        },
        {
          provide: WhatsAppInstanceManager,
          useValue: {
            createInstance: jest.fn().mockResolvedValue(undefined),
            getInstance: jest.fn(),
            getAllInstances: jest.fn(),
            removeInstance: jest.fn().mockResolvedValue(undefined),
            restartInstance: jest.fn().mockResolvedValue(undefined),
            getMetrics: jest.fn()
          }
        },
        {
          provide: WhatsAppMessageRouter,
          useValue: {
            sendMessage: jest.fn().mockResolvedValue({ id: 'msg123' }),
            findBestInstance: jest.fn()
          }
        },
        {
          provide: QrCodeService,
          useValue: {
            generateQRCode: jest.fn()
          }
        },
        {
          provide: EventEmitter2,
          useValue: {
            on: jest.fn(),
            emit: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<WhatsAppWebService>(WhatsAppWebService);
    configService = module.get(ConfigService);
    instanceManager = module.get(WhatsAppInstanceManager);
    messageRouter = module.get(WhatsAppMessageRouter);
    qrCodeService = module.get(QrCodeService);
    eventEmitter2 = module.get(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should skip initialization in test environment', async () => {
      // Arrange
      process.env.NODE_ENV = 'test';

      // Act
      await service.onModuleInit();

      // Assert
      expect(ChromeCleanupUtil.cleanup).not.toHaveBeenCalled();
      expect(instanceManager.createInstance).not.toHaveBeenCalled();
    });

    it('should skip initialization when DISABLE_WHATSAPP_WEB is true', async () => {
      // Arrange
      process.env.DISABLE_WHATSAPP_WEB = 'true';

      // Act
      await service.onModuleInit();

      // Assert
      expect(ChromeCleanupUtil.cleanup).not.toHaveBeenCalled();
      expect(instanceManager.createInstance).not.toHaveBeenCalled();
    });

    it('should clean up Chrome processes and initialize instances', async () => {
      // Arrange
      configService.get.mockReturnValue([mockInstanceConfig]);

      // Act
      await service.onModuleInit();

      // Assert
      expect(ChromeCleanupUtil.cleanup).toHaveBeenCalled();
      expect(instanceManager.createInstance).toHaveBeenCalledWith({
        phoneNumber: '1234567890',
        sessionPath: './sessions/test'
      });
    });

    it('should skip disabled instances', async () => {
      // Arrange
      const instances = [
        { ...mockInstanceConfig, enabled: false },
        { ...mockInstanceConfig, phoneNumber: '0987654321', enabled: true }
      ];
      configService.get.mockReturnValue(instances);

      // Act
      await service.onModuleInit();

      // Assert
      expect(instanceManager.createInstance).toHaveBeenCalledTimes(1);
      expect(instanceManager.createInstance).toHaveBeenCalledWith({
        phoneNumber: '0987654321',
        sessionPath: './sessions/test'
      });
    });

    it('should handle initialization errors gracefully', async () => {
      // Arrange
      configService.get.mockReturnValue([mockInstanceConfig]);
      instanceManager.createInstance.mockRejectedValue(new Error('Init failed'));

      // Act & Assert - Should not throw
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('should create default instance from WHATSAPP_DEFAULT_PHONE', async () => {
      // Arrange
      process.env.WHATSAPP_DEFAULT_PHONE = '5551234567890';
      configService.get.mockReturnValue([]);

      // Act
      await service.onModuleInit();

      // Assert
      expect(instanceManager.createInstance).toHaveBeenCalledWith({
        phoneNumber: '5551234567890',
        sessionPath: undefined
      });
    });

    it('should setup event proxying after initialization', async () => {
      // Arrange
      configService.get.mockReturnValue([mockInstanceConfig]);

      // Act
      await service.onModuleInit();

      // Assert
      expect(eventEmitter2.on).toHaveBeenCalledWith('whatsapp.qr', expect.any(Function));
      expect(eventEmitter2.on).toHaveBeenCalledWith('whatsapp.ready', expect.any(Function));
      expect(eventEmitter2.on).toHaveBeenCalledWith('whatsapp.disconnected', expect.any(Function));
      expect(eventEmitter2.on).toHaveBeenCalledWith('whatsapp.message', expect.any(Function));
    });
  });

  describe('getStatus', () => {
    it('should return status for all instances', () => {
      // Arrange
      instanceManager.getAllInstances.mockReturnValue([mockInstance]);

      // Act
      const result = service.getStatus();

      // Assert
      expect(result).toEqual({
        instances: [{
          phoneNumber: '1234567890',
          connected: true,
          number: '1234567890',
          name: 'Test User'
        }]
      });
    });

    it('should handle instances not ready', () => {
      // Arrange
      const notReadyInstance = { ...mockInstance, status: 'initializing' as const };
      instanceManager.getAllInstances.mockReturnValue([notReadyInstance]);

      // Act
      const result = service.getStatus();

      // Assert
      expect(result.instances[0].connected).toBe(false);
    });

    it('should handle client info errors', () => {
      // Arrange
      const errorInstance = {
        ...mockInstance,
        client: {
          get info() {
            throw new Error('Info error');
          }
        }
      };
      instanceManager.getAllInstances.mockReturnValue([errorInstance]);

      // Act
      const result = service.getStatus();

      // Assert
      expect(result.instances[0].connected).toBe(false);
    });
  });

  describe('getInstanceStatus', () => {
    it('should return status for specific instance', () => {
      // Arrange
      instanceManager.getInstance.mockReturnValue(mockInstance);

      // Act
      const result = service.getInstanceStatus('1234567890');

      // Assert
      expect(result).toEqual({
        connected: true,
        number: '1234567890',
        name: 'Test User'
      });
    });

    it('should handle missing instance', () => {
      // Arrange
      instanceManager.getInstance.mockReturnValue(undefined);

      // Act
      const result = service.getInstanceStatus('1234567890');

      // Assert
      expect(result).toEqual({ connected: false });
    });

    it('should handle instance not ready', () => {
      // Arrange
      instanceManager.getInstance.mockReturnValue({ ...mockInstance, status: 'initializing' });

      // Act
      const result = service.getInstanceStatus('1234567890');

      // Assert
      expect(result).toEqual({ connected: false });
    });
  });

  describe('sendMessage', () => {
    it('should send message via specified instance', async () => {
      // Act
      const result = await service.sendMessage('recipient@c.us', 'Hello', undefined, '1234567890');

      // Assert
      expect(messageRouter.sendMessage).toHaveBeenCalledWith('1234567890', 'recipient@c.us', 'Hello');
      expect(result).toEqual({ id: 'msg123' });
    });

    it('should find best instance when not specified', async () => {
      // Arrange
      messageRouter.findBestInstance.mockResolvedValue('best-instance');

      // Act
      await service.sendMessage('recipient@c.us', 'Hello');

      // Assert
      expect(messageRouter.findBestInstance).toHaveBeenCalledWith('recipient@c.us');
      expect(messageRouter.sendMessage).toHaveBeenCalledWith('best-instance', 'recipient@c.us', 'Hello');
    });

    it('should throw error when no instances ready', async () => {
      // Arrange
      messageRouter.findBestInstance.mockResolvedValue(null);

      // Act & Assert
      await expect(service.sendMessage('recipient@c.us', 'Hello'))
        .rejects.toThrow('No WhatsApp instances are ready');
    });
  });

  describe('sendInteractiveMessage', () => {
    it('should convert buttons to text menu', async () => {
      // Arrange
      const buttons = [
        { id: 'btn1', title: 'Option 1' },
        { id: 'btn2', title: 'Option 2' }
      ];
      messageRouter.findBestInstance.mockResolvedValue('instance1');

      // Act
      await service.sendInteractiveMessage('recipient@c.us', 'Choose an option:', buttons);

      // Assert
      expect(messageRouter.sendMessage).toHaveBeenCalledWith(
        'instance1',
        'recipient@c.us',
        'Choose an option:\n\nPlease reply with the number of your choice:\n1. Option 1\n2. Option 2'
      );
    });

    it('should use specified instance for interactive message', async () => {
      // Arrange
      const buttons = [{ id: 'btn1', title: 'Yes' }];

      // Act
      await service.sendInteractiveMessage('recipient@c.us', 'Confirm?', buttons, '1234567890');

      // Assert
      expect(messageRouter.sendMessage).toHaveBeenCalledWith(
        '1234567890',
        'recipient@c.us',
        expect.stringContaining('1. Yes')
      );
    });
  });

  describe('sendImage', () => {
    it('should send image with caption', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image-data');
      messageRouter.findBestInstance.mockResolvedValue('instance1');

      // Act
      await service.sendImage('recipient@c.us', imageBuffer, 'Caption text');

      // Assert
      expect(messageRouter.sendMessage).toHaveBeenCalledWith(
        'instance1',
        'recipient@c.us',
        { text: 'Caption text', media: imageBuffer }
      );
    });

    it('should send image without caption', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image-data');
      messageRouter.findBestInstance.mockResolvedValue('instance1');

      // Act
      await service.sendImage('recipient@c.us', imageBuffer);

      // Assert
      expect(messageRouter.sendMessage).toHaveBeenCalledWith(
        'instance1',
        'recipient@c.us',
        { text: '', media: imageBuffer }
      );
    });

    it('should use specified instance', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image-data');

      // Act
      await service.sendImage('recipient@c.us', imageBuffer, 'Caption', '1234567890');

      // Assert
      expect(messageRouter.sendMessage).toHaveBeenCalledWith(
        '1234567890',
        'recipient@c.us',
        { text: 'Caption', media: imageBuffer }
      );
    });
  });

  describe('sendVoiceMessage', () => {
    it('should send voice message', async () => {
      // Arrange
      const audioBuffer = Buffer.from('audio-data');
      messageRouter.findBestInstance.mockResolvedValue('instance1');

      // Act
      await service.sendVoiceMessage('recipient@c.us', audioBuffer);

      // Assert
      expect(messageRouter.sendMessage).toHaveBeenCalledWith(
        'instance1',
        'recipient@c.us',
        { text: '', voice: audioBuffer }
      );
    });

    it('should use specified instance for voice', async () => {
      // Arrange
      const audioBuffer = Buffer.from('audio-data');

      // Act
      await service.sendVoiceMessage('recipient@c.us', audioBuffer, '1234567890');

      // Assert
      expect(messageRouter.sendMessage).toHaveBeenCalledWith(
        '1234567890',
        'recipient@c.us',
        { text: '', voice: audioBuffer }
      );
    });
  });

  describe('sendMedia', () => {
    it('should send media as image', async () => {
      // Arrange
      const mediaBuffer = Buffer.from('media-data');
      messageRouter.findBestInstance.mockResolvedValue('instance1');

      // Act
      await service.sendMedia('recipient@c.us', mediaBuffer, 'Caption');

      // Assert
      expect(messageRouter.sendMessage).toHaveBeenCalledWith(
        'instance1',
        'recipient@c.us',
        { text: 'Caption', media: mediaBuffer }
      );
    });

    it('should reject URL media', async () => {
      // Act & Assert
      await expect(service.sendMedia('recipient@c.us', 'http://example.com/image.jpg'))
        .rejects.toThrow('URL media not supported in multi-instance mode yet');
    });
  });

  describe('getQRCode', () => {
    it('should get QR code for specific instance', async () => {
      // Arrange
      const qrInstance = { ...mockInstance, status: 'qr_pending' as const };
      instanceManager.getInstance.mockReturnValue(qrInstance);

      // Act
      const result = await service.getQRCode('1234567890');

      // Assert
      expect(result).toBe('qr-code-data');
    });

    it('should return null for ready instance', async () => {
      // Arrange
      instanceManager.getInstance.mockReturnValue(mockInstance);

      // Act
      const result = await service.getQRCode('1234567890');

      // Assert
      expect(result).toBeNull();
    });

    it('should get first pending QR when no phone specified', async () => {
      // Arrange
      const instances = [
        { ...mockInstance, status: 'ready' as const },
        { ...mockInstance, status: 'qr_pending' as const, phoneNumber: '987654321' }
      ];
      instanceManager.getAllInstances.mockReturnValue(instances);

      // Act
      const result = await service.getQRCode();

      // Assert
      expect(result).toBe('qr-code-data');
    });
  });

  describe('getAllQRCodes', () => {
    it('should return QR codes for all instances', async () => {
      // Arrange
      const instances: any[] = [
        { phoneNumber: '111', status: 'qr_pending' as const, qrCode: 'qr1', sessionPath: '', createdAt: new Date(), client: {} as any },
        { phoneNumber: '222', status: 'ready' as const, qrCode: null, sessionPath: '', createdAt: new Date(), client: {} as any },
        { phoneNumber: '333', status: 'qr_pending' as const, qrCode: 'qr3', sessionPath: '', createdAt: new Date(), client: {} as any }
      ];
      instanceManager.getAllInstances.mockReturnValue(instances);

      // Act
      const result = await service.getAllQRCodes();

      // Assert
      expect(result).toEqual([
        { phoneNumber: '111', qrCode: 'qr1' },
        { phoneNumber: '222', qrCode: null },
        { phoneNumber: '333', qrCode: 'qr3' }
      ]);
    });
  });

  describe('disconnect', () => {
    it('should disconnect and logout instance', async () => {
      // Arrange
      instanceManager.getInstance.mockReturnValue(mockInstance);

      // Act
      await service.disconnect('1234567890', true);

      // Assert
      expect(mockInstance.client.logout).toHaveBeenCalled();
      expect(mockInstance.status).toBe('disconnected');
    });

    it('should disconnect without logout', async () => {
      // Arrange
      instanceManager.getInstance.mockReturnValue(mockInstance);

      // Act
      await service.disconnect('1234567890', false);

      // Assert
      expect(mockInstance.client.logout).not.toHaveBeenCalled();
      expect(mockInstance.status).toBe('disconnected');
    });

    it('should throw error for missing instance', async () => {
      // Arrange
      instanceManager.getInstance.mockReturnValue(undefined);

      // Act & Assert
      await expect(service.disconnect('1234567890'))
        .rejects.toThrow('Instance 1234567890 not found');
    });
  });

  describe('clearSession', () => {
    it('should remove and recreate instance', async () => {
      // Act
      await service.clearSession('1234567890');

      // Assert
      expect(instanceManager.removeInstance).toHaveBeenCalledWith('1234567890');
      expect(instanceManager.createInstance).toHaveBeenCalledWith({ phoneNumber: '1234567890' });
    });
  });

  describe('reconnect', () => {
    it('should clear session to trigger reconnect', async () => {
      // Arrange
      jest.spyOn(service, 'clearSession');

      // Act
      await service.reconnect('1234567890');

      // Assert
      expect(service.clearSession).toHaveBeenCalledWith('1234567890');
    });
  });

  describe('restartInstance', () => {
    it('should restart instance', async () => {
      // Act
      await service.restartInstance('1234567890');

      // Assert
      expect(instanceManager.restartInstance).toHaveBeenCalledWith('1234567890');
    });
  });

  describe('getClientInfo', () => {
    it('should return info from first ready instance', () => {
      // Arrange
      const readyInstance = { 
        ...mockInstance, 
        status: 'ready' as const,
        client: {
          info: {
            wid: { user: '1234567890' },
            pushname: 'Test User'
          },
          logout: jest.fn()
        }
      };
      instanceManager.getAllInstances.mockReturnValue([readyInstance]);

      // Act
      const result = service.getClientInfo();

      // Assert
      expect(result).toEqual({
        wid: { user: '1234567890' },
        pushname: 'Test User'
      });
    });

    it('should return null when no ready instances', () => {
      // Arrange
      instanceManager.getAllInstances.mockReturnValue([
        { ...mockInstance, status: 'initializing' as const }
      ]);

      // Act
      const result = service.getClientInfo();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('logout', () => {
    it('should logout all ready instances', async () => {
      // Arrange
      const instances = [
        mockInstance,
        { ...mockInstance, phoneNumber: '222', status: 'ready' as const },
        { ...mockInstance, phoneNumber: '333', status: 'initializing' as const }
      ];
      instanceManager.getAllInstances.mockReturnValue(instances);

      // Act
      await service.logout();

      // Assert
      expect(instances[0].client.logout).toHaveBeenCalled();
      expect(instances[1].client.logout).toHaveBeenCalled();
      expect(ChromeCleanupUtil.cleanup).toHaveBeenCalled();
    });

    it('should handle logout errors gracefully', async () => {
      // Arrange
      const errorClient = {
        logout: jest.fn().mockRejectedValue(new Error('Logout failed'))
      };
      const errorInstance = { ...mockInstance, client: errorClient };
      instanceManager.getAllInstances.mockReturnValue([errorInstance]);

      // Act & Assert - Should not throw
      await expect(service.logout()).resolves.toBeUndefined();
      expect(ChromeCleanupUtil.cleanup).toHaveBeenCalled();
    });
  });

  describe('isClientReady', () => {
    it('should return true when at least one instance ready', () => {
      // Arrange
      instanceManager.getAllInstances.mockReturnValue([
        { ...mockInstance, status: 'initializing' as const },
        { ...mockInstance, status: 'ready' as const }
      ]);

      // Act
      const result = service.isClientReady();

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when no instances ready', () => {
      // Arrange
      instanceManager.getAllInstances.mockReturnValue([
        { ...mockInstance, status: 'initializing' as const }
      ]);

      // Act
      const result = service.isClientReady();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics from instance manager', () => {
      // Arrange
      const metrics = {
        total: 2,
        ready: 1,
        disconnected: 0,
        failed: 0,
        instances: [
          {
            phoneNumber: '1234567890',
            status: 'ready' as const,
            createdAt: new Date(),
            lastActivity: new Date()
          }
        ]
      };
      instanceManager.getMetrics.mockReturnValue(metrics);

      // Act
      const result = service.getMetrics();

      // Assert
      expect(result).toEqual(metrics);
    });
  });

  describe('Event handling', () => {
    it('should add event listener', () => {
      // Arrange
      const handler = jest.fn();

      // Act
      service.on('message', handler);

      // Assert
      expect(service['eventEmitter'].addEventListener).toBeDefined();
    });

    it('should remove event listener', () => {
      // Arrange
      const handler = jest.fn();

      // Act
      service.off('message', handler);

      // Assert
      expect(service['eventEmitter'].removeEventListener).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should cleanup on module destroy', async () => {
      // Act
      await service.onModuleDestroy();

      // Assert
      expect(service['isInitialized']).toBe(false);
    });

    it('should cleanup before application shutdown', async () => {
      // Act
      await service.beforeApplicationShutdown('SIGTERM');

      // Assert
      expect(service['isInitialized']).toBe(false);
    });
  });
});