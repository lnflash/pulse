import { GroupGamesPlugin } from './group-games.plugin';
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

describe('GroupGamesPlugin', () => {
  let plugin: GroupGamesPlugin;

  beforeEach(() => {
    plugin = new GroupGamesPlugin(mockSession as any);
  });

  it('has correct id and name', () => {
    expect(plugin.id).toBe('group-games');
    expect(plugin.name).toBe('Group Games & Polls');
  });

  it('provides recognizers', () => {
    const recs = plugin.getRecognizers();
    expect(recs.length).toBeGreaterThanOrEqual(5);
  });

  it('rejects non-group context', async () => {
    const result = await plugin.execute('poll', ctx({ isGroup: false }));
    expect((result.text[0] as any).value).toContain('only available in group');
  });

  it('creates a poll', async () => {
    const result = await plugin.execute('poll', ctx({ rawText: 'poll What? | Yes | No' }));
    expect((result.text[0] as any).value).toContain('New Poll');
  });

  it('rejects poll with insufficient options', async () => {
    const result = await plugin.execute('poll', ctx({ rawText: 'poll What?' }));
    expect((result.text[0] as any).value).toContain('at least 2 options');
  });

  it('prevents duplicate polls', async () => {
    await plugin.execute('poll', ctx({ rawText: 'poll Q? | A | B' }));
    const result = await plugin.execute('poll', ctx({ rawText: 'poll Q2? | C | D' }));
    expect((result.text[0] as any).value).toContain('already an active poll');
  });

  it('handles voting', async () => {
    await plugin.execute('poll', ctx({ rawText: 'poll Q? | A | B' }));
    const result = await plugin.execute('vote', ctx({ rawText: 'vote 1' }));
    expect((result.text[0] as any).value).toContain('Vote recorded');
  });

  it('prevents double voting', async () => {
    await plugin.execute('poll', ctx({ rawText: 'poll Q? | A | B' }));
    await plugin.execute('vote', ctx({ rawText: 'vote 1' }));
    const result = await plugin.execute('vote', ctx({ rawText: 'vote 2' }));
    expect((result.text[0] as any).value).toContain('already voted');
  });

  it('shows results', async () => {
    await plugin.execute('poll', ctx({ rawText: 'poll Q? | A | B' }));
    const result = await plugin.execute('results', ctx());
    expect((result.text[0] as any).value).toContain('Poll Results');
  });

  it('starts a quickdraw game', async () => {
    const result = await plugin.execute('game', ctx({ rawText: 'game quickdraw' }));
    expect((result.text[0] as any).value).toContain('Quick Draw');
  });

  it('starts a number guess game', async () => {
    const result = await plugin.execute('game', ctx({ rawText: 'game guess' }));
    expect((result.text[0] as any).value).toContain('Number Guess');
  });

  it('joins a game', async () => {
    await plugin.execute('game', ctx({ rawText: 'game quickdraw' }));
    const result = await plugin.execute('join', ctx({ userId: 'u2' }));
    expect((result.text[0] as any).value).toContain('joined');
  });

  it('handles guess in number game', async () => {
    await plugin.execute('game', ctx({ rawText: 'game guess' }));
    const result = await plugin.execute('guess', ctx({ rawText: 'guess 50' }));
    const text = (result.text[0] as any).value;
    expect(text.includes('WINNER') || text.includes('Try')).toBe(true);
  });

  it('onLoad and onUnload work', async () => {
    await expect(plugin.onLoad()).resolves.toBeUndefined();
    await expect(plugin.onUnload()).resolves.toBeUndefined();
  });
});
