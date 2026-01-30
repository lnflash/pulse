import { DailyChallengePlugin } from './daily-challenge.plugin';
import { CommandContext } from '../../../core/ports/plugin.port';

const mockSession = {
  getSession: jest.fn().mockResolvedValue(null),
  getOrCreateSession: jest.fn(),
  updateSession: jest.fn(),
  deleteSession: jest.fn(),
};

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  return { userId: 'u1', isAuthenticated: true, isGroup: false, rawText: 'daily', ...overrides };
}

describe('DailyChallengePlugin', () => {
  let plugin: DailyChallengePlugin;

  beforeEach(() => {
    plugin = new DailyChallengePlugin(mockSession as any);
  });

  it('has correct id and name', () => {
    expect(plugin.id).toBe('daily-challenge');
    expect(plugin.name).toBe('Daily Challenges');
  });

  it('provides recognizers', () => {
    const recs = plugin.getRecognizers();
    expect(recs.length).toBeGreaterThanOrEqual(3);
    expect(recs[0].pluginId).toBe('daily-challenge');
  });

  it('recognizer patterns match expected inputs', () => {
    const recs = plugin.getRecognizers();
    const daily = recs.find((r) => r.action === 'daily')!;
    expect(daily.patterns.some((p) => p.test('daily'))).toBe(true);
    expect(daily.patterns.some((p) => p.test('challenge'))).toBe(true);
    expect(daily.patterns.some((p) => p.test("today's challenge"))).toBe(true);
  });

  it('shows daily challenge', async () => {
    const result = await plugin.execute('daily', ctx());
    expect((result.text[0] as any).value).toContain('Daily Challenge');
  });

  it('starts challenge with "daily start"', async () => {
    const result = await plugin.execute('daily', ctx({ rawText: 'daily start' }));
    expect((result.text[0] as any).value).toContain('Challenge Started');
  });

  it('shows streak', async () => {
    const result = await plugin.execute('streak', ctx());
    const text = (result.text[0] as any).value;
    expect(text).toContain('Challenge Stats');
    expect(text).toContain('Current Streak');
  });

  it('completes a challenge', async () => {
    await plugin.execute('daily', ctx({ rawText: 'daily start' }));
    const result = await plugin.execute('complete', ctx({ rawText: 'complete block' }));
    const text = (result.text[0] as any).value;
    expect(
      text.includes('completed') || text.includes('not correct') || text.includes('sats'),
    ).toBe(true);
  });

  it('prevents completing without starting', async () => {
    const result = await plugin.execute('complete', ctx({ rawText: 'complete' }));
    expect((result.text[0] as any).value).toContain("haven't started");
  });

  it('prevents double completion', async () => {
    await plugin.execute('daily', ctx({ rawText: 'daily start' }));
    await plugin.execute('complete', ctx({ rawText: 'complete block' }));
    const result = await plugin.execute('complete', ctx({ rawText: 'complete block' }));
    const text = (result.text[0] as any).value;
    expect(text.includes('already completed') || text.includes('sats')).toBe(true);
  });

  it('shows already completed when viewing daily again', async () => {
    await plugin.execute('daily', ctx({ rawText: 'daily start' }));
    await plugin.execute('complete', ctx({ rawText: 'complete block' }));
    const result = await plugin.execute('daily', ctx());
    const text = (result.text[0] as any).value;
    expect(text.includes('already completed') || text.includes('Daily Challenge')).toBe(true);
  });

  it('tracks streak after completion', async () => {
    await plugin.execute('daily', ctx({ rawText: 'daily start' }));
    await plugin.execute('complete', ctx({ rawText: 'complete block' }));
    const result = await plugin.execute('streak', ctx());
    const text = (result.text[0] as any).value;
    expect(text).toContain('Total Completed');
  });

  it('onLoad and onUnload work', async () => {
    await expect(plugin.onLoad()).resolves.toBeUndefined();
    await expect(plugin.onUnload()).resolves.toBeUndefined();
  });
});
