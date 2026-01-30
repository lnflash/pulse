import { EntertainmentPlugin } from './entertainment.plugin';
import { CommandContext } from '../../../core/ports/plugin.port';

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  return { userId: 'u1', isAuthenticated: false, isGroup: false, rawText: '', ...overrides };
}

describe('EntertainmentPlugin', () => {
  let plugin: EntertainmentPlugin;

  beforeEach(() => {
    plugin = new EntertainmentPlugin();
  });

  it('has correct id and name', () => {
    expect(plugin.id).toBe('joke-meme');
    expect(plugin.name).toBe('Entertainment');
  });

  it('provides recognizers', () => {
    const recs = plugin.getRecognizers();
    expect(recs.length).toBeGreaterThanOrEqual(5);
  });

  it('recognizer patterns match expected inputs', () => {
    const recs = plugin.getRecognizers();
    const joke = recs.find((r) => r.action === 'joke')!;
    expect(joke.patterns.some((p) => p.test('joke'))).toBe(true);
    expect(joke.patterns.some((p) => p.test('tell me a joke'))).toBe(true);
    expect(joke.patterns.some((p) => p.test('make me laugh'))).toBe(true);
  });

  it('returns a joke', async () => {
    const result = await plugin.execute('joke', ctx({ rawText: 'joke' }));
    expect((result.text[0] as any).value).toBeTruthy();
    expect((result.text[0] as any).value.length).toBeGreaterThan(10);
  });

  it('returns crypto joke when requested', async () => {
    const result = await plugin.execute('joke', ctx({ rawText: 'joke bitcoin' }));
    expect((result.text[0] as any).value).toBeTruthy();
  });

  it('returns a meme', async () => {
    const result = await plugin.execute('meme', ctx());
    expect((result.text[0] as any).value).toBeTruthy();
  });

  it('roasts a target', async () => {
    const result = await plugin.execute('roast', ctx({ rawText: 'roast @john' }));
    const text = (result.text[0] as any).value;
    expect(text).toContain('john');
    expect(text).toContain('Just kidding');
  });

  it('roasts self', async () => {
    const result = await plugin.execute('roast', ctx({ rawText: 'roast me' }));
    expect((result.text[0] as any).value).toContain('You');
  });

  it('returns a dad joke', async () => {
    const result = await plugin.execute('dadjoke', ctx());
    expect((result.text[0] as any).value).toBeTruthy();
  });

  it('returns a fortune', async () => {
    const result = await plugin.execute('fortune', ctx());
    expect((result.text[0] as any).value).toBeTruthy();
    expect((result.text[0] as any).value.length).toBeGreaterThan(10);
  });

  it('handles unknown action', async () => {
    const result = await plugin.execute('unknown', ctx());
    expect((result.text[0] as any).value).toContain('Unknown');
  });

  it('onLoad and onUnload work', async () => {
    await expect(plugin.onLoad()).resolves.toBeUndefined();
    await expect(plugin.onUnload()).resolves.toBeUndefined();
  });

  it('joke recognizer has keywords', () => {
    const recs = plugin.getRecognizers();
    const joke = recs.find((r) => r.action === 'joke')!;
    expect(joke.keywords).toContain('joke');
  });

  it('fortune recognizer matches variations', () => {
    const recs = plugin.getRecognizers();
    const fortune = recs.find((r) => r.action === 'fortune')!;
    expect(fortune.patterns.some((p) => p.test('fortune'))).toBe(true);
    expect(fortune.patterns.some((p) => p.test('tell my fortune'))).toBe(true);
    expect(fortune.patterns.some((p) => p.test('give me wisdom'))).toBe(true);
  });
});
