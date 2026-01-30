import { AnonymousPlugin } from './anonymous.plugin';
import { CommandContext } from '../../../core/ports/plugin.port';

const mockSession = {
  getSession: jest.fn().mockResolvedValue(null),
  getOrCreateSession: jest.fn(),
  updateSession: jest.fn(),
  deleteSession: jest.fn(),
};

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    userId: 'u1',
    isAuthenticated: false,
    isGroup: true,
    groupId: 'g1',
    rawText: '',
    ...overrides,
  };
}

describe('AnonymousPlugin', () => {
  let plugin: AnonymousPlugin;

  beforeEach(() => {
    plugin = new AnonymousPlugin(mockSession as any);
  });

  it('has correct id and name', () => {
    expect(plugin.id).toBe('anonymous-messaging');
    expect(plugin.name).toBe('Anonymous Messaging');
  });

  it('provides recognizers', () => {
    const recs = plugin.getRecognizers();
    expect(recs.length).toBeGreaterThanOrEqual(4);
  });

  it('recognizer patterns match expected inputs', () => {
    const recs = plugin.getRecognizers();
    const anon = recs.find((r) => r.action === 'anon')!;
    expect(anon.patterns.some((p) => p.test('anon hello there'))).toBe(true);
    expect(anon.patterns.some((p) => p.test('confess I did it'))).toBe(true);
  });

  it('sends anonymous message', async () => {
    const result = await plugin.execute('anon', ctx({ rawText: 'anon I love this group' }));
    const text = (result.text[0] as any).value;
    expect(text).toContain('Anonymous');
    expect(text).toContain('I love this group');
  });

  it('rejects empty anonymous message', async () => {
    const result = await plugin.execute('anon', ctx({ rawText: 'anon' }));
    expect((result.text[0] as any).value).toContain('provide a message');
  });

  it('sends anonymous reply', async () => {
    await plugin.execute('anon', ctx({ rawText: 'anon original message' }));
    const result = await plugin.execute('anonreply', ctx({ rawText: 'anonreply thanks!' }));
    expect((result.text[0] as any).value).toContain('replying');
  });

  it('rejects reply without prior message', async () => {
    const result = await plugin.execute(
      'anonreply',
      ctx({ rawText: 'anonreply hello', groupId: 'g999' }),
    );
    expect((result.text[0] as any).value).toContain('No recent');
  });

  it('creates anonymous poll', async () => {
    const result = await plugin.execute('anonpoll', ctx({ rawText: 'anonpoll Q? | A | B' }));
    expect((result.text[0] as any).value).toContain('Anonymous Poll');
  });

  it('rejects anon poll outside group', async () => {
    const result = await plugin.execute(
      'anonpoll',
      ctx({ isGroup: false, rawText: 'anonpoll Q? | A | B' }),
    );
    expect((result.text[0] as any).value).toContain('only be created in groups');
  });

  it('sends anonymous DM', async () => {
    const result = await plugin.execute('anondm', ctx({ rawText: 'anon dm @john great work!' }));
    expect((result.text[0] as any).value).toContain('DM sent');
  });

  it('starts anonymous conversation', async () => {
    const result = await plugin.execute('anonconvo', ctx({ isGroup: false }));
    const text = (result.text[0] as any).value;
    expect(text).toContain('Conversation Started');
    expect(text).toContain('alias');
  });

  it('detects existing conversation', async () => {
    await plugin.execute('anonconvo', ctx({ isGroup: false }));
    const result = await plugin.execute('anonconvo', ctx({ isGroup: false }));
    expect((result.text[0] as any).value).toContain('already have');
  });

  it('generates consistent alias per session', async () => {
    const r1 = await plugin.execute('anon', ctx({ rawText: 'anon msg1' }));
    const r2 = await plugin.execute('anon', ctx({ rawText: 'anon msg2' }));
    const alias1 = (r1.text[0] as any).value.split('\n')[0];
    const alias2 = (r2.text[0] as any).value.split('\n')[0];
    expect(alias1).toBe(alias2);
  });

  it('onLoad and onUnload work', async () => {
    await expect(plugin.onLoad()).resolves.toBeUndefined();
    await expect(plugin.onUnload()).resolves.toBeUndefined();
  });
});
