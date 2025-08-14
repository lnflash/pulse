import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

// Define the correct type for amqplib Connection to resolve TypeScript errors
interface AmqpConnection extends amqp.Connection {
  close(): Promise<void>;
  createChannel(): Promise<amqp.Channel>;
}

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private connection: AmqpConnection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly logger = new Logger(EventsService.name);
  private readonly queueName: string;
  private readonly rabbitmqUrl: string;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    this.rabbitmqUrl = this.configService.get<string>('rabbitmq.url') || '';
    this.queueName = this.configService.get<string>('rabbitmq.queueName') || '';

    if (!this.rabbitmqUrl || !this.queueName) {
      this.logger.warn('RabbitMQ configuration incomplete. Event handling will be limited.');
    }
  }

  /**
   * Check if connected to RabbitMQ
   */
  async isConnected(): Promise<boolean> {
    return this.connection !== null && this.channel !== null;
  }

  async onModuleInit() {
    // Skip initialization in test environment
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      if (!this.rabbitmqUrl || !this.queueName) {
        this.logger.warn('Skipping RabbitMQ connection due to missing configuration');
        return;
      }

      await this.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`, error.stack);
    }
  }

  async onModuleDestroy() {
    try {
      // Clear any pending reconnect timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      if (this.channel) {
        await this.channel.close();
      }

      if (this.connection) {
        await this.connection.close();
      }
    } catch (error) {
      this.logger.error(`Error closing RabbitMQ connection: ${error.message}`, error.stack);
    }
  }

  /**
   * Emit an event (for compatibility with EventEmitter pattern)
   */
  async emit(eventName: string, data: any): Promise<void> {
    try {
      const eventData = {
        event: eventName,
        data,
        timestamp: new Date().toISOString()
      };
      
      await this.sendMessage(eventData);
    } catch (error) {
      this.logger.error(`Failed to emit event ${eventName}:`, error);
    }
  }

  /**
   * Connect to RabbitMQ and set up channel
   */
  private async connect(): Promise<void> {
    try {
      // Use type assertion to match our extended interface
      this.connection = (await amqp.connect(this.rabbitmqUrl)) as unknown as AmqpConnection;

      // Now we can use createChannel directly
      this.channel = await this.connection.createChannel();

      // Ensure queue exists
      if (this.channel) {
        await this.channel.assertQueue(this.queueName, {
          durable: true,
        });
      }

      // Set up connection error handlers
      if (this.connection) {
        this.connection.on('error', (err) => {
          this.logger.error(`RabbitMQ connection error: ${err.message}`, err.stack);
          this.reconnect();
        });

        this.connection.on('close', () => {
          this.logger.warn('RabbitMQ connection closed, attempting to reconnect');
          this.reconnect();
        });
      }
    } catch (error) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Attempt to reconnect to RabbitMQ with exponential backoff
   */
  private async reconnect(attempt = 1, maxAttempts = 10): Promise<void> {
    if (attempt > maxAttempts) {
      this.logger.error(`Failed to reconnect to RabbitMQ after ${maxAttempts} attempts`);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);

    // Clear any existing timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect();
        this.reconnectTimeout = null;
      } catch (error) {
        this.logger.error(`Reconnection attempt ${attempt} failed: ${error.message}`);
        await this.reconnect(attempt + 1, maxAttempts);
      }
    }, delay);
  }

  /**
   * Publish an event to RabbitMQ
   */
  async publishEvent(eventType: string, data: any): Promise<boolean> {
    try {
      if (!this.channel) {
        this.logger.warn('Cannot publish event: RabbitMQ channel not available');
        return false;
      }

      const eventData = {
        type: eventType,
        timestamp: new Date().toISOString(),
        data,
      };

      const buffer = Buffer.from(JSON.stringify(eventData));

      return this.channel.sendToQueue(this.queueName, buffer, {
        persistent: true,
        contentType: 'application/json',
      });
    } catch (error) {
      this.logger.error(`Failed to publish event: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Subscribe to events with a callback function
   */
  async subscribeToEvents(
    callback: (eventType: string, data: any) => Promise<void>,
  ): Promise<void> {
    try {
      if (!this.channel) {
        this.logger.warn('Cannot subscribe to events: RabbitMQ channel not available');
        return;
      }

      await this.channel.consume(this.queueName, async (msg) => {
        if (!msg) return;

        try {
          const content = msg.content.toString();
          const event = JSON.parse(content);

          // Log incoming events for debugging

          await callback(event.type, event.data);

          // Acknowledge the message
          if (this.channel) {
            this.channel.ack(msg);
          }
        } catch (error) {
          this.logger.error(`Error processing event: ${error.message}`, error.stack);

          // Reject the message and requeue it if it's not a parsing error
          if (this.channel) {
            this.channel.reject(msg, !error.message.includes('JSON'));
          }
        }
      });
    } catch (error) {
      this.logger.error(`Failed to subscribe to events: ${error.message}`, error.stack);
    }
  }
}
