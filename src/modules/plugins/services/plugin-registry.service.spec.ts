import { PluginRegistryService } from './plugin-registry.service';
import { PluginPort, PluginRecognizer, HandlerResult } from '../../../core/ports/plugin.port';
import { FormattedText } from '../../../core/types/messages';

function mockPlugin(overrides: Partial<PluginPort> = {}): PluginPort {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    description: 'A test plugin',
    getRecognizers: () => [
      { pluginId: 'test-plugin', action: 'greet', patterns: [/^hello$/i], keywords: ['hello'] },
    ],
    execute: jest.fn().mockResolvedValue({ text: [{ type: 'text', value: 'ok' }] }),
    onLoad: jest.fn().mockResolvedValue(undefined),
    onUnload: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeRegistry(): PluginRegistryService {
  const discovery = { getProviders: () => [] } as any;
  return new PluginRegistryService(discovery);
}

describe('PluginRegistryService', () => {
  let registry: PluginRegistryService;

  beforeEach(() => {
    registry = makeRegistry();
  });

  it('registers a plugin and calls onLoad', async () => {
    const plugin = mockPlugin();
    await registry.register(plugin);

    expect(plugin.onLoad).toHaveBeenCalled();
    expect(registry.getPlugin('test-plugin')).toBe(plugin);
    expect(registry.getAllPlugins()).toHaveLength(1);
  });

  it('skips duplicate registration', async () => {
    const plugin = mockPlugin();
    await registry.register(plugin);
    await registry.register(plugin);

    expect(plugin.onLoad).toHaveBeenCalledTimes(1);
    expect(registry.getAllPlugins()).toHaveLength(1);
  });

  it('unregisters a plugin and calls onUnload', async () => {
    const plugin = mockPlugin();
    await registry.register(plugin);
    await registry.unregister('test-plugin');

    expect(plugin.onUnload).toHaveBeenCalled();
    expect(registry.getPlugin('test-plugin')).toBeUndefined();
    expect(registry.getAllRecognizers()).toHaveLength(0);
  });

  it('collects recognizers from registered plugins', async () => {
    const plugin = mockPlugin();
    await registry.register(plugin);

    const recognizers = registry.getAllRecognizers();
    expect(recognizers).toHaveLength(1);
    expect(recognizers[0].pluginId).toBe('test-plugin');
    expect(recognizers[0].action).toBe('greet');
  });

  it('matches recognizer by pattern', async () => {
    const plugin = mockPlugin();
    await registry.register(plugin);

    const match = registry.matchRecognizer('hello');
    expect(match).not.toBeNull();
    expect(match!.recognizer.pluginId).toBe('test-plugin');
    expect(match!.confidence).toBe(0.9);
  });

  it('matches recognizer by keyword', async () => {
    const plugin = mockPlugin({
      getRecognizers: () => [
        { pluginId: 'test-plugin', action: 'greet', patterns: [], keywords: ['hello'] },
      ],
    });
    await registry.register(plugin);

    const match = registry.matchRecognizer('say hello friend');
    expect(match).not.toBeNull();
    expect(match!.confidence).toBe(0.7);
  });

  it('returns null for unmatched text', async () => {
    const plugin = mockPlugin();
    await registry.register(plugin);

    const match = registry.matchRecognizer('xyz123');
    expect(match).toBeNull();
  });

  it('executes plugin action', async () => {
    const plugin = mockPlugin();
    await registry.register(plugin);

    const ctx = { userId: 'u1', isAuthenticated: false, isGroup: false, rawText: 'hello' };
    const result = await registry.execute('test-plugin', 'greet', ctx);

    expect(plugin.execute).toHaveBeenCalledWith('greet', ctx);
    expect(result.error).toBeUndefined();
  });

  it('returns error for unknown plugin', async () => {
    const ctx = { userId: 'u1', isAuthenticated: false, isGroup: false, rawText: 'hello' };
    const result = await registry.execute('nonexistent', 'greet', ctx);

    expect(result.error).toBe(true);
  });

  it('registers multiple plugins', async () => {
    const p1 = mockPlugin({ id: 'p1', name: 'P1' });
    const p2 = mockPlugin({
      id: 'p2',
      name: 'P2',
      getRecognizers: () => [
        { pluginId: 'p2', action: 'test', patterns: [/^test$/i], keywords: ['test'] },
      ],
    });

    await registry.register(p1);
    await registry.register(p2);

    expect(registry.getAllPlugins()).toHaveLength(2);
    expect(registry.getAllRecognizers()).toHaveLength(2);
  });
});
