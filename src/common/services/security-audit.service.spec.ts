import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SecurityAuditService, SecurityEventType, SecurityEvent } from './security-audit.service';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
jest.mock('fs/promises');

describe('SecurityAuditService', () => {
  let service: SecurityAuditService;
  let configService: jest.Mocked<ConfigService>;
  const mockFs = fs as jest.Mocked<typeof fs>;

  const mockSecurityEvent = {
    type: SecurityEventType.LOGIN_SUCCESS,
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    userId: 'user123',
    details: { username: 'testuser' },
    severity: 'info' as const,
  };

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup fs mocks
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('');
    mockFs.appendFile.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ mtime: new Date() } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityAuditService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
              const config: any = {
                'AUDIT_LOG_ENABLED': true,
                'AUDIT_LOG_RETENTION_DAYS': 90,
              };
              return config[key] !== undefined ? config[key] : defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SecurityAuditService>(SecurityAuditService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should initialize audit log directory when enabled', async () => {
      // Assert
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('security-audit'),
        { recursive: true }
      );
    });

    it('should not initialize when disabled', async () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'AUDIT_LOG_ENABLED') return false;
        return defaultValue;
      });

      // Act
      const disabledService = new SecurityAuditService(configService);

      // Assert
      expect(disabledService['isEnabled']).toBe(false);
    });

    it('should handle initialization errors gracefully', async () => {
      // Arrange
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      // Act & Assert - Should not throw
      expect(() => new SecurityAuditService(configService)).not.toThrow();
    });
  });

  describe('logSecurityEvent', () => {
    it('should log info level event', async () => {
      // Arrange
      jest.spyOn(service['logger'], 'log');
      jest.spyOn(service as any, 'writeToAuditLog').mockResolvedValue(undefined);

      // Act
      await service.logSecurityEvent(mockSecurityEvent);

      // Assert
      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('LOGIN_SUCCESS'),
        expect.any(String)
      );
      expect((service as any).writeToAuditLog).toHaveBeenCalled();
    });

    it('should log warning level event', async () => {
      // Arrange
      const warningEvent = { ...mockSecurityEvent, severity: 'warning' as const };
      jest.spyOn(service['logger'], 'warn');
      jest.spyOn(service as any, 'writeToAuditLog').mockResolvedValue(undefined);

      // Act
      await service.logSecurityEvent(warningEvent);

      // Assert
      expect(service['logger'].warn).toHaveBeenCalled();
    });

    it('should log critical level event and send alert', async () => {
      // Arrange
      const criticalEvent = {
        ...mockSecurityEvent,
        type: SecurityEventType.SQL_INJECTION_ATTEMPT,
        severity: 'critical' as const,
      };
      jest.spyOn(service['logger'], 'error');
      jest.spyOn(service as any, 'writeToAuditLog').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'sendSecurityAlert').mockResolvedValue(undefined);

      // Act
      await service.logSecurityEvent(criticalEvent);

      // Assert
      expect(service['logger'].error).toHaveBeenCalled();
      expect((service as any).sendSecurityAlert).toHaveBeenCalled();
    });

    it('should skip logging when disabled', async () => {
      // Arrange
      (service as any).isEnabled = false;
      jest.spyOn(service as any, 'writeToAuditLog');

      // Act
      await service.logSecurityEvent(mockSecurityEvent);

      // Assert
      expect((service as any).writeToAuditLog).not.toHaveBeenCalled();
    });

    it('should add timestamp to event', async () => {
      // Arrange
      jest.spyOn(service as any, 'writeToAuditLog').mockImplementation(async (event: SecurityEvent) => {
        expect(event.timestamp).toBeInstanceOf(Date);
      });

      // Act
      await service.logSecurityEvent(mockSecurityEvent);

      // Assert
      expect((service as any).writeToAuditLog).toHaveBeenCalled();
    });
  });

  describe('getSecurityEvents', () => {
    const mockEvents = [
      {
        timestamp: new Date('2024-01-01T10:00:00Z'),
        type: SecurityEventType.LOGIN_SUCCESS,
        ip: '192.168.1.1',
        userId: 'user1',
        severity: 'info',
        details: {},
      },
      {
        timestamp: new Date('2024-01-01T11:00:00Z'),
        type: SecurityEventType.LOGIN_FAILURE,
        ip: '192.168.1.2',
        userId: 'user2',
        severity: 'warning',
        details: {},
      },
      {
        timestamp: new Date('2024-01-01T12:00:00Z'),
        type: SecurityEventType.SQL_INJECTION_ATTEMPT,
        ip: '192.168.1.3',
        severity: 'critical',
        details: {},
      },
    ];

    beforeEach(() => {
      const logContent = mockEvents.map(e => JSON.stringify(e)).join('\n');
      mockFs.readFile.mockResolvedValue(logContent);
    });

    it('should return all events without filters', async () => {
      // Act
      const events = await service.getSecurityEvents();

      // Assert
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe(SecurityEventType.SQL_INJECTION_ATTEMPT); // Most recent first
    });

    it('should filter by event type', async () => {
      // Act
      const events = await service.getSecurityEvents({
        type: SecurityEventType.LOGIN_SUCCESS,
      });

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(SecurityEventType.LOGIN_SUCCESS);
    });

    it('should filter by IP address', async () => {
      // Act
      const events = await service.getSecurityEvents({
        ip: '192.168.1.2',
      });

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].ip).toBe('192.168.1.2');
    });

    it('should filter by user ID', async () => {
      // Act
      const events = await service.getSecurityEvents({
        userId: 'user1',
      });

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe('user1');
    });

    it('should filter by severity', async () => {
      // Act
      const events = await service.getSecurityEvents({
        severity: 'critical',
      });

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe('critical');
    });

    it('should filter by date range', async () => {
      // Act
      const events = await service.getSecurityEvents({
        startDate: new Date('2024-01-01T10:30:00Z'),
        endDate: new Date('2024-01-01T11:30:00Z'),
      });

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(SecurityEventType.LOGIN_FAILURE);
    });

    it('should apply limit', async () => {
      // Act
      const events = await service.getSecurityEvents({
        limit: 2,
      });

      // Assert
      expect(events).toHaveLength(2);
    });

    it('should return empty array when disabled', async () => {
      // Arrange
      (service as any).isEnabled = false;

      // Act
      const events = await service.getSecurityEvents();

      // Assert
      expect(events).toEqual([]);
    });

    it('should handle file read errors', async () => {
      // Arrange
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      // Act
      const events = await service.getSecurityEvents();

      // Assert
      expect(events).toEqual([]);
    });

    it('should handle malformed JSON lines', async () => {
      // Arrange
      mockFs.readFile.mockResolvedValue('{"valid": true}\ninvalid json\n{"valid": true}');

      // Act
      const events = await service.getSecurityEvents();

      // Assert
      expect(events).toHaveLength(2);
    });
  });

  describe('getSecuritySummary', () => {
    it('should generate security summary', async () => {
      // Arrange
      const events = [
        { ...mockSecurityEvent, severity: 'info' as const },
        { ...mockSecurityEvent, severity: 'warning' as const },
        { ...mockSecurityEvent, severity: 'critical' as const },
        { ...mockSecurityEvent, type: SecurityEventType.LOGIN_FAILURE, severity: 'warning' as const },
      ];
      jest.spyOn(service, 'getSecurityEvents').mockResolvedValue(events as any);

      // Act
      const summary = await service.getSecuritySummary();

      // Assert
      expect(summary.total).toBe(4);
      expect(summary.bySeverity.info).toBe(1);
      expect(summary.bySeverity.warning).toBe(2);
      expect(summary.bySeverity.critical).toBe(1);
      expect(summary.byType[SecurityEventType.LOGIN_SUCCESS]).toBe(3);
      expect(summary.byType[SecurityEventType.LOGIN_FAILURE]).toBe(1);
    });

    it('should identify top IPs', async () => {
      // Arrange
      const events = [
        { ...mockSecurityEvent, ip: '192.168.1.1' },
        { ...mockSecurityEvent, ip: '192.168.1.1' },
        { ...mockSecurityEvent, ip: '192.168.1.2' },
        { ...mockSecurityEvent, ip: '192.168.1.1' },
      ];
      jest.spyOn(service, 'getSecurityEvents').mockResolvedValue(events as any);

      // Act
      const summary = await service.getSecuritySummary();

      // Assert
      expect(summary.topIPs[0]).toEqual({ ip: '192.168.1.1', count: 3 });
      expect(summary.topIPs[1]).toEqual({ ip: '192.168.1.2', count: 1 });
    });

    it('should collect recent critical events', async () => {
      // Arrange
      const criticalEvents = Array(15).fill(null).map((_, i) => ({
        ...mockSecurityEvent,
        severity: 'critical' as const,
        details: { index: i },
      }));
      jest.spyOn(service, 'getSecurityEvents').mockResolvedValue(criticalEvents as any);

      // Act
      const summary = await service.getSecuritySummary();

      // Assert
      expect(summary.recentCritical).toHaveLength(10); // Limited to 10
      expect(summary.bySeverity.critical).toBe(15);
    });

    it('should handle empty events', async () => {
      // Arrange
      jest.spyOn(service, 'getSecurityEvents').mockResolvedValue([]);

      // Act
      const summary = await service.getSecuritySummary();

      // Assert
      expect(summary.total).toBe(0);
      expect(summary.topIPs).toEqual([]);
      expect(summary.recentCritical).toEqual([]);
    });
  });

  describe('Security Event Types', () => {
    it('should handle all security event types', async () => {
      // Arrange
      const eventTypes = Object.values(SecurityEventType);
      jest.spyOn(service as any, 'writeToAuditLog').mockResolvedValue(undefined);

      // Act & Assert
      for (const type of eventTypes) {
        const event = { ...mockSecurityEvent, type };
        await expect(service.logSecurityEvent(event)).resolves.not.toThrow();
      }
    });
  });

  describe('cleanupOldLogs', () => {
    it('should remove logs older than retention period', async () => {
      // Arrange
      // Create dates that are definitely older and newer than retention period
      const today = new Date();
      const oldDate = new Date(today);
      oldDate.setDate(oldDate.getDate() - 100); // 100 days old
      const recentDate = new Date(today);
      recentDate.setDate(recentDate.getDate() - 10); // 10 days old
      
      const oldDateStr = oldDate.toISOString().split('T')[0];
      const recentDateStr = recentDate.toISOString().split('T')[0];
      
      mockFs.readdir.mockResolvedValue([
        `security-${oldDateStr}.log`,
        `security-${recentDateStr}.log`,
      ] as any);

      // Act
      await (service as any).cleanupOldLogs();

      // Assert
      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining(`security-${oldDateStr}.log`)
      );
      expect(mockFs.unlink).not.toHaveBeenCalledWith(
        expect.stringContaining(`security-${recentDateStr}.log`)
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      // Arrange
      mockFs.readdir.mockRejectedValue(new Error('Read error'));

      // Act & Assert - Should not throw
      await expect((service as any).cleanupOldLogs()).resolves.not.toThrow();
    });
  });

  describe('writeToAuditLog', () => {
    it('should write event to log file', async () => {
      // Arrange
      const event: SecurityEvent = {
        ...mockSecurityEvent,
        timestamp: new Date('2024-01-01T12:00:00Z'),
      };

      // Act
      await (service as any).writeToAuditLog(event);

      // Assert
      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('security-'),
        expect.stringContaining(JSON.stringify(event)),
        'utf-8'
      );
    });

    it('should use date-based log file naming', async () => {
      // Arrange
      const event: SecurityEvent = {
        ...mockSecurityEvent,
        timestamp: new Date('2024-03-15T12:00:00Z'),
      };

      // Act
      await (service as any).writeToAuditLog(event);

      // Assert
      expect(mockFs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('2024-03-15'),
        expect.any(String),
        'utf-8'
      );
    });
  });

  describe('sendSecurityAlert', () => {
    it('should handle alert sending', async () => {
      // Arrange
      const criticalEvent: SecurityEvent = {
        ...mockSecurityEvent,
        timestamp: new Date(),
        severity: 'critical',
        type: SecurityEventType.SQL_INJECTION_ATTEMPT,
      };

      // Act & Assert - Should not throw
      await expect((service as any).sendSecurityAlert(criticalEvent)).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent log writes', async () => {
      // Arrange
      jest.spyOn(service as any, 'writeToAuditLog').mockResolvedValue(undefined);
      const events = Array(10).fill(null).map((_, i) => ({
        ...mockSecurityEvent,
        details: { index: i },
      }));

      // Act
      const promises = events.map(e => service.logSecurityEvent(e));
      await Promise.all(promises);

      // Assert
      expect((service as any).writeToAuditLog).toHaveBeenCalledTimes(10);
    });

    it('should handle very large event details', async () => {
      // Arrange
      const largeEvent = {
        ...mockSecurityEvent,
        details: {
          data: 'x'.repeat(10000),
          nested: { deep: { value: Array(1000).fill('test') } },
        },
      };
      jest.spyOn(service as any, 'writeToAuditLog').mockResolvedValue(undefined);

      // Act & Assert
      await expect(service.logSecurityEvent(largeEvent)).resolves.not.toThrow();
    });

    it('should handle special characters in log data', async () => {
      // Arrange
      const specialEvent = {
        ...mockSecurityEvent,
        details: {
          query: "'; DROP TABLE users; --",
          script: '<script>alert("XSS")</script>',
        },
      };
      jest.spyOn(service as any, 'writeToAuditLog').mockResolvedValue(undefined);

      // Act & Assert
      await expect(service.logSecurityEvent(specialEvent)).resolves.not.toThrow();
    });
  });
});