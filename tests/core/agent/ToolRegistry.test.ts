/**
 * ToolRegistry tests.
 */

import { ToolRegistry } from '../../../src/core/agent/ToolRegistry';
import type { Tool, ToolResult, ToolExecutionContext } from '../../../src/core/tools/Tool';
import type { WalletPort } from '../../../src/ports/WalletPort';
import { createDefaultContext } from '../../../src/core/context/UserContext';

const stubWalletPort = {
  getBalance: jest.fn(),
  sendPayment: jest.fn(),
  createInvoice: jest.fn(),
  getInvoice: jest.fn(),
  getTransactionHistory: jest.fn(),
  getExchangeRate: jest.fn(),
  estimateFee: jest.fn(),
  resolveRecipient: jest.fn(),
  ping: jest.fn(),
} as unknown as WalletPort;

/** Factory for a test tool. */
function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'test_tool',
    description: 'A test tool',
    parameters: { type: 'object', properties: {} },
    category: 'system',
    requiresAuth: false,
    requiresConfirmation: false,
    execute: async (): Promise<ToolResult> => ({
      success: true,
      output: 'test output',
      signal: 'complete',
    }),
    ...overrides,
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  const phoneHash = 'test-hash-123';
  const userContext = createDefaultContext(phoneHash);

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register / get', () => {
    it('registers a tool and retrieves it', () => {
      const tool = makeTool();
      registry.register(tool);
      expect(registry.get('test_tool')).toBe(tool);
    });

    it('throws when registering duplicate tool name', () => {
      registry.register(makeTool());
      expect(() => registry.register(makeTool())).toThrow(/already registered/);
    });

    it('replace() upserts without throwing', () => {
      registry.register(makeTool({ name: 'my_tool' }));
      const updated = makeTool({ name: 'my_tool', description: 'Updated' });
      expect(() => registry.replace(updated)).not.toThrow();
      expect(registry.get('my_tool')?.description).toBe('Updated');
    });

    it('returns undefined for unknown tools', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('unregister', () => {
    it('removes a registered tool', () => {
      registry.register(makeTool());
      expect(registry.unregister('test_tool')).toBe(true);
      expect(registry.has('test_tool')).toBe(false);
    });

    it('returns false for unknown tools', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  describe('getToolsForUser', () => {
    it('returns non-auth tools for unlinked users', () => {
      registry.register(makeTool({ name: 'public_tool', requiresAuth: false }));
      registry.register(makeTool({ name: 'private_tool', requiresAuth: true }));
      const tools = registry.getToolsForUser(userContext);
      expect(tools.map((t) => t.name)).toContain('public_tool');
      expect(tools.map((t) => t.name)).not.toContain('private_tool');
    });

    it('returns auth tools for linked users', () => {
      registry.register(makeTool({ name: 'private_tool', requiresAuth: true }));
      const linkedContext = createDefaultContext(phoneHash, {
        identity: { phoneHash, accountLinked: true } as any,
      });
      const tools = registry.getToolsForUser(linkedContext);
      expect(tools.map((t) => t.name)).toContain('private_tool');
    });

    it('excludes merchant tools for non-merchant users', () => {
      registry.register(makeTool({ name: 'merchant_tool', category: 'merchant', requiresAuth: false }));
      const tools = registry.getToolsForUser(userContext);
      expect(tools.map((t) => t.name)).not.toContain('merchant_tool');
    });
  });

  describe('toToolDefinitions', () => {
    it('converts tools to AI-compatible format', () => {
      registry.register(makeTool({ name: 'my_tool', description: 'Does stuff' }));
      const defs = registry.toToolDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0]).toMatchObject({
        name: 'my_tool',
        description: 'Does stuff',
        parameters: { type: 'object' },
      });
    });
  });

  describe('execute', () => {
    it('executes a registered tool', async () => {
      registry.register(makeTool());
      const ctx: ToolExecutionContext = {
        userContext,
        updateContext: jest.fn(),
        requestId: 'req-123',
        walletPort: stubWalletPort,
      };
      const result = await registry.execute('test_tool', {}, ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBe('test output');
    });

    it('throws for unknown tool', async () => {
      const ctx: ToolExecutionContext = {
        userContext,
        updateContext: jest.fn(),
        requestId: 'req-123',
        walletPort: stubWalletPort,
      };
      await expect(registry.execute('nonexistent', {}, ctx)).rejects.toThrow(/unknown tool/);
    });

    it('returns error result when tool throws', async () => {
      registry.register(
        makeTool({
          execute: async () => { throw new Error('boom'); },
        }),
      );
      const ctx: ToolExecutionContext = {
        userContext,
        updateContext: jest.fn(),
        requestId: 'req-123',
        walletPort: stubWalletPort,
      };
      const result = await registry.execute('test_tool', {}, ctx);
      expect(result.success).toBe(false);
      expect(result.output).toContain('boom');
    });
  });

  describe('size', () => {
    it('tracks the number of registered tools', () => {
      expect(registry.size).toBe(0);
      registry.register(makeTool({ name: 'tool_a' }));
      registry.register(makeTool({ name: 'tool_b' }));
      expect(registry.size).toBe(2);
      registry.unregister('tool_a');
      expect(registry.size).toBe(1);
    });
  });
});
