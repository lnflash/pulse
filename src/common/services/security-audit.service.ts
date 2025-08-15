import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

export enum SecurityEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  API_KEY_USED = 'API_KEY_USED',
  API_KEY_INVALID = 'API_KEY_INVALID',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_REQUEST = 'SUSPICIOUS_REQUEST',
  IP_BLOCKED = 'IP_BLOCKED',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  COMMAND_INJECTION_ATTEMPT = 'COMMAND_INJECTION_ATTEMPT',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  DATA_EXPORT = 'DATA_EXPORT',
  ADMIN_ACTION = 'ADMIN_ACTION',
  MFA_SUCCESS = 'MFA_SUCCESS',
  MFA_FAILURE = 'MFA_FAILURE',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  WEBHOOK_INVALID = 'WEBHOOK_INVALID',
}

export interface SecurityEvent {
  timestamp: Date;
  type: SecurityEventType;
  ip: string;
  userAgent?: string;
  userId?: string;
  details: any;
  severity: 'info' | 'warning' | 'critical';
}

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);
  private readonly auditLogPath: string;
  private readonly isEnabled: boolean;
  private readonly retentionDays: number;

  constructor(private configService: ConfigService) {
    this.isEnabled = this.configService.get<boolean>('AUDIT_LOG_ENABLED', true);
    this.retentionDays = this.configService.get<number>('AUDIT_LOG_RETENTION_DAYS', 90);
    this.auditLogPath = path.join(process.cwd(), 'logs', 'security-audit');

    if (this.isEnabled) {
      this.initializeAuditLog();
    }
  }

  async logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>) {
    if (!this.isEnabled) return;

    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date(),
    };

    // Log to console with appropriate level
    const logMessage = `Security Event: ${event.type} from ${event.ip}`;
    switch (event.severity) {
      case 'critical':
        this.logger.error(logMessage, JSON.stringify(event.details));
        break;
      case 'warning':
        this.logger.warn(logMessage, JSON.stringify(event.details));
        break;
      default:
        this.logger.log(logMessage, JSON.stringify(event.details));
    }

    // Write to audit log file
    await this.writeToAuditLog(fullEvent);

    // Send alerts for critical events
    if (event.severity === 'critical') {
      await this.sendSecurityAlert(fullEvent);
    }
  }

  async getSecurityEvents(filters?: {
    type?: SecurityEventType;
    ip?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    severity?: 'info' | 'warning' | 'critical';
    limit?: number;
  }) {
    if (!this.isEnabled) return [];

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.auditLogPath, `security-${today}.log`);

    try {
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      let events = lines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // Apply filters
      if (filters) {
        if (filters.type) {
          events = events.filter((e) => e.type === filters.type);
        }
        if (filters.ip) {
          events = events.filter((e) => e.ip === filters.ip);
        }
        if (filters.userId) {
          events = events.filter((e) => e.userId === filters.userId);
        }
        if (filters.severity) {
          events = events.filter((e) => e.severity === filters.severity);
        }
        if (filters.startDate) {
          events = events.filter((e) => new Date(e.timestamp) >= filters.startDate!);
        }
        if (filters.endDate) {
          events = events.filter((e) => new Date(e.timestamp) <= filters.endDate!);
        }
      }

      // Sort by timestamp descending
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply limit
      if (filters?.limit) {
        events = events.slice(0, filters.limit);
      }

      return events;
    } catch (error) {
      this.logger.error('Failed to read security events', error);
      return [];
    }
  }

  async getSecuritySummary() {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const events = await this.getSecurityEvents({ startDate: last24Hours });

    const summary = {
      total: events.length,
      bySeverity: {
        info: 0,
        warning: 0,
        critical: 0,
      },
      byType: {} as Record<string, number>,
      topIPs: [] as { ip: string; count: number }[],
      recentCritical: [] as SecurityEvent[],
    };

    const ipCounts = new Map<string, number>();

    events.forEach((event) => {
      // Count by severity
      summary.bySeverity[event.severity as keyof typeof summary.bySeverity]++;

      // Count by type
      summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;

      // Count IPs
      ipCounts.set(event.ip, (ipCounts.get(event.ip) || 0) + 1);

      // Collect recent critical events
      if (event.severity === 'critical' && summary.recentCritical.length < 10) {
        summary.recentCritical.push(event);
      }
    });

    // Get top 10 IPs
    summary.topIPs = Array.from(ipCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    return summary;
  }

  private async initializeAuditLog() {
    try {
      await fs.mkdir(this.auditLogPath, { recursive: true });
      await this.cleanupOldLogs();
    } catch (error) {
      this.logger.error('Failed to initialize audit log directory', error);
    }
  }

  private async writeToAuditLog(event: SecurityEvent) {
    const date = event.timestamp.toISOString().split('T')[0];
    const logFile = path.join(this.auditLogPath, `security-${date}.log`);

    try {
      const logEntry = JSON.stringify(event) + '\n';
      await fs.appendFile(logFile, logEntry, 'utf-8');
    } catch (error) {
      this.logger.error('Failed to write to audit log', error);
    }
  }

  private async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.auditLogPath);
      const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

      for (const file of files) {
        if (file.startsWith('security-') && file.endsWith('.log')) {
          const dateStr = file.replace('security-', '').replace('.log', '');
          const fileDate = new Date(dateStr);

          if (fileDate < cutoffDate) {
            await fs.unlink(path.join(this.auditLogPath, file));
            this.logger.log(`Cleaned up old audit log: ${file}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old logs', error);
    }
  }

  private async sendSecurityAlert(event: SecurityEvent) {
    // Implement your alert mechanism here (email, SMS, Slack, etc.)
    // For now, just log it prominently
    this.logger.error(`🚨 SECURITY ALERT: ${event.type}`, {
      ip: event.ip,
      userId: event.userId,
      details: event.details,
    });
  }
}
