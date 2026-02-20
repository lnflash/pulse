/**
 * EventBus unit tests.
 *
 * Covers:
 * - Typed event emission and listener invocation
 * - One-time listeners (once)
 * - Listener removal (off)
 * - removeAllListeners for cleanup
 * - Multiple listeners on the same event
 * - Listener isolation across event types
 */

// Mock logger to suppress pino output during tests
jest.mock('../../src/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { EventBus } from '../../src/orchestrator/EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(() => {
    bus.removeAllListeners();
  });

  // ---------------------------------------------------------------------------
  // Basic emission
  // ---------------------------------------------------------------------------
  describe('emit / on', () => {
    it('calls a registered listener when the event is emitted', () => {
      const handler = jest.fn();
      bus.on('message.received', handler);

      bus.emit('message.received', {
        phoneNumber: '+18765551234',
        messageId: 'msg-001',
        platform: 'whatsapp',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        phoneNumber: '+18765551234',
        messageId: 'msg-001',
        platform: 'whatsapp',
      });
    });

    it('passes the correct payload to the listener', () => {
      const payloads: Array<{ phoneHash: string; requestId: string }> = [];

      bus.on('agent.loop.start', (p) => {
        payloads.push(p);
      });

      bus.emit('agent.loop.start', { phoneHash: 'hash-abc', requestId: 'req-1' });
      bus.emit('agent.loop.start', { phoneHash: 'hash-def', requestId: 'req-2' });

      expect(payloads).toHaveLength(2);
      expect(payloads[0]).toEqual({ phoneHash: 'hash-abc', requestId: 'req-1' });
      expect(payloads[1]).toEqual({ phoneHash: 'hash-def', requestId: 'req-2' });
    });

    it('calls multiple listeners for the same event', () => {
      const handlerA = jest.fn();
      const handlerB = jest.fn();

      bus.on('message.sent', handlerA);
      bus.on('message.sent', handlerB);

      bus.emit('message.sent', { phoneNumber: '+18765551234', messageId: 'msg-002' });

      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerB).toHaveBeenCalledTimes(1);
    });

    it('does not call a listener registered on a different event', () => {
      const handler = jest.fn();
      bus.on('payment.completed', handler);

      bus.emit('payment.failed', { phoneHash: 'hash-x', error: 'Insufficient funds' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('supports all defined event types in PulseEventMap', () => {
      const handler = jest.fn();

      bus.on('rate.limit.hit', handler);
      bus.emit('rate.limit.hit', { phoneHash: 'hash-123', tier: 'standard' });

      expect(handler).toHaveBeenCalledWith({ phoneHash: 'hash-123', tier: 'standard' });
    });

    it('emits agent.loop.complete with full payload', () => {
      const handler = jest.fn();
      bus.on('agent.loop.complete', handler);

      bus.emit('agent.loop.complete', {
        phoneHash: 'hash-abc',
        requestId: 'req-x',
        durationMs: 1234,
        tokensUsed: 300,
      });

      expect(handler).toHaveBeenCalledWith({
        phoneHash: 'hash-abc',
        requestId: 'req-x',
        durationMs: 1234,
        tokensUsed: 300,
      });
    });

    it('emits payment events correctly', () => {
      const paymentInitiated = jest.fn();
      const paymentCompleted = jest.fn();

      bus.on('payment.initiated', paymentInitiated);
      bus.on('payment.completed', paymentCompleted);

      bus.emit('payment.initiated', {
        phoneHash: 'hash-payer',
        amountSats: 10_000,
        destination: 'user@flash.com',
      });
      bus.emit('payment.completed', {
        phoneHash: 'hash-payer',
        transactionId: 'tx-001',
        amountSats: 10_000,
      });

      expect(paymentInitiated).toHaveBeenCalledTimes(1);
      expect(paymentCompleted).toHaveBeenCalledTimes(1);
      expect(paymentInitiated).toHaveBeenCalledWith({
        phoneHash: 'hash-payer',
        amountSats: 10_000,
        destination: 'user@flash.com',
      });
    });

    it('emits user.linked event', () => {
      const handler = jest.fn();
      bus.on('user.linked', handler);

      bus.emit('user.linked', {
        phoneHash: 'hash-new',
        flashUsername: 'alice',
      });

      expect(handler).toHaveBeenCalledWith({
        phoneHash: 'hash-new',
        flashUsername: 'alice',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // One-time listeners
  // ---------------------------------------------------------------------------
  describe('once', () => {
    it('fires a once listener only on the first emission', () => {
      const handler = jest.fn();
      bus.once('message.received', handler);

      bus.emit('message.received', {
        phoneNumber: '+1111',
        messageId: 'm1',
        platform: 'whatsapp',
      });
      bus.emit('message.received', {
        phoneNumber: '+2222',
        messageId: 'm2',
        platform: 'whatsapp',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        phoneNumber: '+1111',
        messageId: 'm1',
        platform: 'whatsapp',
      });
    });

    it('does not remove a persistent on() listener when once() fires', () => {
      const persistentHandler = jest.fn();
      const oneTimeHandler = jest.fn();

      bus.on('tool.executed', persistentHandler);
      bus.once('tool.executed', oneTimeHandler);

      bus.emit('tool.executed', {
        toolName: 'CheckBalance',
        success: true,
        phoneHash: 'hash-abc',
      });
      bus.emit('tool.executed', {
        toolName: 'SendPayment',
        success: false,
        phoneHash: 'hash-abc',
      });

      expect(persistentHandler).toHaveBeenCalledTimes(2);
      expect(oneTimeHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Listener removal
  // ---------------------------------------------------------------------------
  describe('off', () => {
    it('stops calling a listener after off() is called', () => {
      const handler = jest.fn();
      bus.on('message.received', handler);

      bus.emit('message.received', {
        phoneNumber: '+18765551234',
        messageId: 'msg-1',
        platform: 'whatsapp',
      });

      bus.off('message.received', handler);

      bus.emit('message.received', {
        phoneNumber: '+18765551234',
        messageId: 'msg-2',
        platform: 'whatsapp',
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('removing one listener does not affect other listeners on the same event', () => {
      const handlerA = jest.fn();
      const handlerB = jest.fn();

      bus.on('message.sent', handlerA);
      bus.on('message.sent', handlerB);

      bus.off('message.sent', handlerA);

      bus.emit('message.sent', { phoneNumber: '+111', messageId: 'x' });

      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalledTimes(1);
    });

    it('off() with a handler that was never registered is a no-op', () => {
      const neverRegistered = jest.fn();
      // Should not throw
      expect(() => bus.off('agent.loop.error', neverRegistered)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // removeAllListeners
  // ---------------------------------------------------------------------------
  describe('removeAllListeners', () => {
    it('removes all listeners for all events', () => {
      const handlerA = jest.fn();
      const handlerB = jest.fn();
      const handlerC = jest.fn();

      bus.on('message.received', handlerA);
      bus.on('message.sent', handlerB);
      bus.on('payment.completed', handlerC);

      bus.removeAllListeners();

      bus.emit('message.received', {
        phoneNumber: '+111',
        messageId: 'm1',
        platform: 'whatsapp',
      });
      bus.emit('message.sent', { phoneNumber: '+222', messageId: 'm2' });
      bus.emit('payment.completed', {
        phoneHash: 'h',
        transactionId: 'tx',
        amountSats: 1000,
      });

      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).not.toHaveBeenCalled();
      expect(handlerC).not.toHaveBeenCalled();
    });

    it('allows new listeners to be registered after removeAllListeners', () => {
      const oldHandler = jest.fn();
      bus.on('user.escalated', oldHandler);
      bus.removeAllListeners();

      const newHandler = jest.fn();
      bus.on('user.escalated', newHandler);

      bus.emit('user.escalated', {
        phoneHash: 'hash-x',
        requestId: 'req-y',
        reason: 'Human requested',
      });

      expect(oldHandler).not.toHaveBeenCalled();
      expect(newHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles emitting an event with no listeners gracefully', () => {
      expect(() =>
        bus.emit('agent.loop.error', {
          phoneHash: 'hash-err',
          requestId: 'req-err',
          error: 'Something broke',
        }),
      ).not.toThrow();
    });

    it('supports high-frequency emission without dropping events', () => {
      const received: number[] = [];

      bus.on('tool.executed', (p) => {
        // Extract a counter from toolName for verification
        const n = parseInt(p.toolName.replace('Tool', ''), 10);
        received.push(n);
      });

      const COUNT = 100;
      for (let i = 0; i < COUNT; i++) {
        bus.emit('tool.executed', {
          toolName: `Tool${i}`,
          success: true,
          phoneHash: 'hash',
        });
      }

      expect(received).toHaveLength(COUNT);
      for (let i = 0; i < COUNT; i++) {
        expect(received[i]).toBe(i);
      }
    });

    it('independent EventBus instances do not share listeners', () => {
      const busA = new EventBus();
      const busB = new EventBus();
      const handlerA = jest.fn();
      const handlerB = jest.fn();

      busA.on('message.received', handlerA);
      busB.on('message.received', handlerB);

      busA.emit('message.received', {
        phoneNumber: '+1',
        messageId: 'm',
        platform: 'whatsapp',
      });

      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerB).not.toHaveBeenCalled();

      busA.removeAllListeners();
      busB.removeAllListeners();
    });
  });
});
