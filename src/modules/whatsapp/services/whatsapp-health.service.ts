import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WhatsAppWebService } from './whatsapp-web.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MetricsService } from '../../common/metrics/metrics.service';

interface HealthStatus {
  isConnected: boolean;
  lastActivity: Date;
  lastHealthCheck: Date;
  consecutiveFailures: number;
  instanceStatus: Map<string, InstanceHealth>;
}

interface InstanceHealth {
  phoneNumber: string;
  isReady: boolean;
  isAuthenticated: boolean;
  lastMessageTime: Date | null;
  lastActivityTime: Date;
  idleMinutes: number;
  state: string;
}

@Injectable()
export class WhatsAppHealthService {
  private readonly logger = new Logger(WhatsAppHealthService.name);
  private healthStatus: HealthStatus = {
    isConnected: false,
    lastActivity: new Date(),
    lastHealthCheck: new Date(),
    consecutiveFailures: 0,
    instanceStatus: new Map(),
  };

  // Configuration
  private readonly MAX_IDLE_MINUTES = 30; // Max time without activity before restart
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly DEEP_CHECK_INTERVAL = 300000; // 5 minutes

  constructor(
    private readonly whatsappService: WhatsAppWebService,
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
  ) {
    this.initializeHealthMonitoring();
  }

  private initializeHealthMonitoring() {
    // Monitor message events
    this.eventEmitter.on('whatsapp.message.received', () => {
      this.updateActivity();
    });

    this.eventEmitter.on('whatsapp.message.sent', () => {
      this.updateActivity();
    });

    // Monitor connection events
    this.eventEmitter.on('whatsapp.ready', ({ phoneNumber }) => {
      this.logger.log(`WhatsApp instance ${phoneNumber} is ready`);
      this.updateInstanceHealth(phoneNumber, { isReady: true });
    });

    this.eventEmitter.on('whatsapp.disconnected', ({ phoneNumber, reason }) => {
      this.logger.warn(`WhatsApp instance ${phoneNumber} disconnected: ${reason}`);
      this.updateInstanceHealth(phoneNumber, { isReady: false });
      this.handleDisconnection(phoneNumber);
    });

    // Start periodic health checks
    setInterval(() => this.performHealthCheck(), this.HEALTH_CHECK_INTERVAL);
    setInterval(() => this.performDeepHealthCheck(), this.DEEP_CHECK_INTERVAL);

    this.logger.log('WhatsApp health monitoring initialized');
  }

  private updateActivity() {
    this.healthStatus.lastActivity = new Date();
    this.healthStatus.consecutiveFailures = 0;
  }

  private updateInstanceHealth(phoneNumber: string, updates: Partial<InstanceHealth>) {
    const existing = this.healthStatus.instanceStatus.get(phoneNumber) || {
      phoneNumber,
      isReady: false,
      isAuthenticated: false,
      lastMessageTime: null,
      lastActivityTime: new Date(),
      idleMinutes: 0,
      state: 'unknown',
    };

    this.healthStatus.instanceStatus.set(phoneNumber, {
      ...existing,
      ...updates,
      lastActivityTime: new Date(),
    });
  }

  /**
   * Perform regular health check
   */
  private async performHealthCheck() {
    try {
      const instances = await this.whatsappService.getAllInstanceStatus();
      
      let anyHealthy = false;
      for (const [phoneNumber, status] of Object.entries(instances)) {
        const instanceHealth: InstanceHealth = {
          phoneNumber,
          isReady: status.isReady,
          isAuthenticated: status.isAuthenticated,
          lastMessageTime: this.healthStatus.instanceStatus.get(phoneNumber)?.lastMessageTime || null,
          lastActivityTime: new Date(),
          idleMinutes: this.calculateIdleMinutes(phoneNumber),
          state: status.state || 'unknown',
        };

        this.healthStatus.instanceStatus.set(phoneNumber, instanceHealth);

        if (status.isReady && status.isAuthenticated) {
          anyHealthy = true;
        }

        // Check if instance has been idle too long
        if (instanceHealth.idleMinutes > this.MAX_IDLE_MINUTES) {
          this.logger.warn(
            `Instance ${phoneNumber} has been idle for ${instanceHealth.idleMinutes} minutes. Triggering restart...`,
          );
          await this.restartInstance(phoneNumber);
        }
      }

      this.healthStatus.isConnected = anyHealthy;
      this.healthStatus.lastHealthCheck = new Date();

      if (!anyHealthy) {
        this.healthStatus.consecutiveFailures++;
        this.logger.error(
          `No healthy WhatsApp instances found. Consecutive failures: ${this.healthStatus.consecutiveFailures}`,
        );

        if (this.healthStatus.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
          await this.performEmergencyRecovery();
        }
      } else {
        this.healthStatus.consecutiveFailures = 0;
      }

      // Update metrics
      this.metricsService.recordMetric('whatsapp.health.check', {
        healthy: anyHealthy,
        instances: instances.length,
        consecutiveFailures: this.healthStatus.consecutiveFailures,
      });
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`, error.stack);
      this.healthStatus.consecutiveFailures++;
    }
  }

  /**
   * Perform deep health check with connection testing
   */
  private async performDeepHealthCheck() {
    this.logger.debug('Performing deep health check...');

    try {
      const instances = await this.whatsappService.getAllInstanceStatus();
      
      for (const [phoneNumber, status] of Object.entries(instances)) {
        if (status.isReady && status.isAuthenticated) {
          // Test the connection by getting the client state
          try {
            const client = await this.whatsappService.getClientByPhone(phoneNumber);
            if (client) {
              const state = await client.getState();
              this.logger.debug(`Instance ${phoneNumber} state: ${state}`);
              
              if (state !== 'CONNECTED') {
                this.logger.warn(`Instance ${phoneNumber} not connected. State: ${state}`);
                await this.restartInstance(phoneNumber);
              }
            }
          } catch (error) {
            this.logger.error(`Failed to check client state for ${phoneNumber}: ${error.message}`);
            await this.restartInstance(phoneNumber);
          }
        } else if (!status.needsAuth) {
          // Instance should be ready but isn't
          this.logger.warn(`Instance ${phoneNumber} is not ready but doesn't need auth. Restarting...`);
          await this.restartInstance(phoneNumber);
        }
      }
    } catch (error) {
      this.logger.error(`Deep health check failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Calculate idle time for an instance
   */
  private calculateIdleMinutes(phoneNumber: string): number {
    const instance = this.healthStatus.instanceStatus.get(phoneNumber);
    if (!instance?.lastMessageTime) {
      return 0;
    }

    const now = new Date();
    const idleMs = now.getTime() - instance.lastMessageTime.getTime();
    return Math.floor(idleMs / 60000);
  }

  /**
   * Handle disconnection event
   */
  private async handleDisconnection(phoneNumber: string) {
    this.logger.warn(`Handling disconnection for ${phoneNumber}`);

    // Wait a bit to see if it reconnects automatically
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if still disconnected
    const status = await this.whatsappService.getInstanceStatus(phoneNumber);
    if (!status.isReady || !status.isAuthenticated) {
      this.logger.warn(`Instance ${phoneNumber} still disconnected after 5 seconds. Attempting restart...`);
      await this.restartInstance(phoneNumber);
    }
  }

  /**
   * Restart a specific instance
   */
  private async restartInstance(phoneNumber: string) {
    try {
      this.logger.log(`Restarting WhatsApp instance for ${phoneNumber}...`);
      
      // First try graceful restart
      const restarted = await this.whatsappService.restartInstance(phoneNumber);
      
      if (restarted) {
        this.logger.log(`Successfully restarted instance ${phoneNumber}`);
        this.updateInstanceHealth(phoneNumber, { 
          isReady: false, 
          state: 'restarting' 
        });

        // Wait for reconnection
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Verify restart was successful
        const status = await this.whatsappService.getInstanceStatus(phoneNumber);
        if (status.isReady && status.isAuthenticated) {
          this.logger.log(`Instance ${phoneNumber} successfully reconnected`);
          this.updateInstanceHealth(phoneNumber, { 
            isReady: true,
            isAuthenticated: true,
            state: 'connected' 
          });
        } else {
          this.logger.error(`Instance ${phoneNumber} failed to reconnect after restart`);
        }
      } else {
        this.logger.error(`Failed to restart instance ${phoneNumber}`);
      }
    } catch (error) {
      this.logger.error(`Error restarting instance ${phoneNumber}: ${error.message}`, error.stack);
    }
  }

  /**
   * Perform emergency recovery when all instances fail
   */
  private async performEmergencyRecovery() {
    this.logger.error('Performing emergency recovery - restarting all WhatsApp instances...');

    try {
      // Get all instances
      const instances = await this.whatsappService.getAllInstanceStatus();
      
      // Restart each instance
      for (const phoneNumber of Object.keys(instances)) {
        await this.restartInstance(phoneNumber);
        // Wait between restarts to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Reset failure counter
      this.healthStatus.consecutiveFailures = 0;

      // Emit recovery event
      this.eventEmitter.emit('whatsapp.emergency.recovery', {
        timestamp: new Date(),
        instanceCount: Object.keys(instances).length,
      });

      this.logger.log('Emergency recovery completed');
    } catch (error) {
      this.logger.error(`Emergency recovery failed: ${error.message}`, error.stack);
      
      // As a last resort, schedule a full application restart
      this.logger.error('Scheduling application restart in 30 seconds...');
      setTimeout(() => {
        process.exit(1); // PM2 will restart the application
      }, 30000);
    }
  }

  /**
   * Scheduled health check every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledHealthCheck() {
    const idleMinutes = Math.floor(
      (new Date().getTime() - this.healthStatus.lastActivity.getTime()) / 60000,
    );

    this.logger.debug(`Scheduled health check - Idle for ${idleMinutes} minutes`);

    if (idleMinutes > this.MAX_IDLE_MINUTES) {
      this.logger.warn(`System has been idle for ${idleMinutes} minutes. Performing deep check...`);
      await this.performDeepHealthCheck();
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Force restart all instances
   */
  async forceRestartAll(): Promise<void> {
    this.logger.warn('Force restarting all WhatsApp instances...');
    await this.performEmergencyRecovery();
  }
}