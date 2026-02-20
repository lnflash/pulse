/**
 * UpdateContext tool tests.
 */

import { UpdateContext } from '../../../../src/core/tools/system/UpdateContext';
import { createDefaultContext } from '../../../../src/core/context/UserContext';
import type { ToolExecutionContext } from '../../../../src/core/tools/Tool';

describe('UpdateContext tool', () => {
  const phoneHash = 'test-hash';
  let userContext = createDefaultContext(phoneHash);
  let contextPatch: any = {};

  const makeContext = (): ToolExecutionContext => ({
    userContext,
    updateContext: (patch) => { contextPatch = { ...contextPatch, ...patch }; },
    requestId: 'req-test',
  });

  beforeEach(() => {
    userContext = createDefaultContext(phoneHash);
    contextPatch = {};
  });

  const tool = new UpdateContext();

  it('updates preferred currency', async () => {
    const ctx = makeContext();
    const result = await tool.execute({ preferredCurrency: 'JMD' }, ctx);
    expect(result.success).toBe(true);
    expect(contextPatch.understanding?.preferredCurrency).toBe('JMD');
  });

  it('updates dialect', async () => {
    const ctx = makeContext();
    await tool.execute({ dialect: 'jamaican-patois' }, ctx);
    expect(contextPatch.understanding?.dialect).toBe('jamaican-patois');
  });

  it('updates display name', async () => {
    const ctx = makeContext();
    await tool.execute({ displayName: 'Marcus' }, ctx);
    expect(contextPatch.identity?.displayName).toBe('Marcus');
  });

  it('handles prefersVoice boolean', async () => {
    const ctx = makeContext();
    await tool.execute({ prefersVoice: true }, ctx);
    expect(contextPatch.understanding?.prefersVoice).toBe(true);
  });

  it('returns success with no updates when no valid fields provided', async () => {
    const ctx = makeContext();
    const result = await tool.execute({}, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toContain('No context updates');
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('update_context');
    expect(tool.requiresAuth).toBe(false);
    expect(tool.requiresConfirmation).toBe(false);
    expect(tool.category).toBe('system');
  });
});
