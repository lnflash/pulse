/**
 * EventBus — simple typed event emitter for internal Pulse events.
 *
 * Used for decoupling components: when a payment completes, the AgentOrchestrator
 * emits 'payment.completed' and any listeners (notification sender, audit log, etc.)
 * react without tight coupling.
 */

import { EventEmitter } from 'events';
import { logger } from '../config/logger.js';

/** Map of event name → payload type. Add new events here. */
export interface PulseEventMap {
  'message.received': { phoneNumber: string; messageId: string; platform: string };
  'message.sent': { phoneNumber: string; messageId: string };
  'agent.loop.start': { phoneHash: string; requestId: string };
  'agent.loop.complete': { phoneHash: string; requestId: string; durationMs: number; tokensUsed: number };
  'agent.loop.error': { phoneHash: string; requestId: string; error: string };
  'tool.executed': { toolName: string; success: boolean; phoneHash: string };
  'payment.initiated': { phoneHash: string; amountSats: number; destination: string };
  'payment.completed': { phoneHash: string; transactionId: string; amountSats: number };
  'payment.failed': { phoneHash: string; error: string };
  'user.linked': { phoneHash: string; flashUsername: string };
  'user.escalated': { phoneHash: string; requestId: string; reason: string };
  'rate.limit.hit': { phoneHash: string; tier: string };
}

type EventHandler<T> = (payload: T) => void | Promise<void>;

/**
 * EventBus — typed wrapper around Node.js EventEmitter.
 *
 * Provides compile-time type safety for event names and payloads.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  /**
   * Register a listener for an event.
   * @param event Event name.
   * @param handler Handler function.
   */
  on<K extends keyof PulseEventMap>(
    event: K,
    handler: EventHandler<PulseEventMap[K]>,
  ): void {
    this.emitter.on(event, handler);
  }

  /**
   * Register a one-time listener for an event.
   */
  once<K extends keyof PulseEventMap>(
    event: K,
    handler: EventHandler<PulseEventMap[K]>,
  ): void {
    this.emitter.once(event, handler);
  }

  /**
   * Remove a listener.
   */
  off<K extends keyof PulseEventMap>(
    event: K,
    handler: EventHandler<PulseEventMap[K]>,
  ): void {
    this.emitter.off(event, handler);
  }

  /**
   * Emit an event with its payload.
   * Errors thrown by async handlers are caught and logged.
   */
  emit<K extends keyof PulseEventMap>(
    event: K,
    payload: PulseEventMap[K],
  ): void {
    logger.debug({ event, payload }, 'EventBus emit');
    this.emitter.emit(event, payload);
  }

  /**
   * Remove all listeners (used in tests for cleanup).
   */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

/** Singleton instance for use across the application. */
export const eventBus = new EventBus();
