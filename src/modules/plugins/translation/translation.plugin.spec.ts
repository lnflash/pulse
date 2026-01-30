import { TranslationPlugin } from './translation.plugin';
import { CommandContext } from '../../../core/ports/plugin.port';

const mockSession = {
  getSession: jest.fn().mockResolvedValue(null),
  getOrCreateSession: jest.fn(),
  updateSession: jest.fn(),
  deleteSession: jest.fn(),
};

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  return { userId: 'u1', isAuthenticated: false, isGroup: false, rawText: '', ...overrides };
}

describe('TranslationPlugin', () => {
  let plugin: TranslationPlugin;

  beforeEach(() => {
    plugin = new TranslationPlugin(mockSession as any);
  });

  it('has correct id and name', () => {
    expect(plugin.id).toBe('translation');
    expect(plugin.name).toBe('Language Translation');
  });

  it('provides recognizers', () => {
    const recs = plugin.getRecognizers();
    expect(recs.length).toBeGreaterThanOrEqual(3);
  });

  it('recognizer patterns match expected inputs', () => {
    const recs = plugin.getRecognizers();
    const tr = recs.find((r) => r.action === 'translate')!;
    expect(tr.patterns.some((p) => p.test('translate hello'))).toBe(true);
    expect(tr.patterns.some((p) => p.test('tr bonjour'))).toBe(true);
  });

  it('translates known phrase', async () => {
    const result = await plugin.execute(
      'translate',
      ctx({ rawText: 'translate hello to spanish' }),
    );
    const text = (result.text[0] as any).value;
    expect(text).toContain('Translation');
    expect(text).toContain('Hola');
  });

  it('translates to default language', async () => {
    const result = await plugin.execute('translate', ctx({ rawText: 'translate hello' }));
    const text = (result.text[0] as any).value;
    expect(text).toContain('Translation');
  });

  it('handles "what is X in Y" format', async () => {
    const result = await plugin.execute('translate', ctx({ rawText: 'what is hello in french' }));
    expect((result.text[0] as any).value).toContain('Bonjour');
  });

  it('detects language', async () => {
    const result = await plugin.execute('detect', ctx({ rawText: 'detect hola amigo' }));
    const text = (result.text[0] as any).value;
    expect(text).toContain('Language Detection');
    expect(text).toContain('Spanish');
  });

  it('detects CJK languages', async () => {
    const result = await plugin.execute(
      'detect',
      ctx({ rawText: 'detect \u3053\u3093\u306b\u3061\u306f' }),
    );
    expect((result.text[0] as any).value).toContain('Japanese');
  });

  it('shows supported languages', async () => {
    const result = await plugin.execute('languages', ctx());
    const text = (result.text[0] as any).value;
    expect(text).toContain('Supported Languages');
    expect(text).toContain('English');
    expect(text).toContain('Spanish');
  });

  it('enables auto-translate in group', async () => {
    const result = await plugin.execute(
      'autotranslate',
      ctx({ isGroup: true, groupId: 'g1', rawText: 'autotranslate on' }),
    );
    expect((result.text[0] as any).value).toContain('enabled');
  });

  it('disables auto-translate', async () => {
    await plugin.execute(
      'autotranslate',
      ctx({ isGroup: true, groupId: 'g1', rawText: 'autotranslate on' }),
    );
    const result = await plugin.execute(
      'autotranslate',
      ctx({ isGroup: true, groupId: 'g1', rawText: 'autotranslate off' }),
    );
    expect((result.text[0] as any).value).toContain('disabled');
  });

  it('rejects auto-translate outside groups', async () => {
    const result = await plugin.execute(
      'autotranslate',
      ctx({ isGroup: false, rawText: 'autotranslate on' }),
    );
    expect((result.text[0] as any).value).toContain('only available in group');
  });

  it('handles empty translate text', async () => {
    const result = await plugin.execute('translate', ctx({ rawText: 'translate' }));
    expect((result.text[0] as any).value).toContain('provide text');
  });

  it('onLoad and onUnload work', async () => {
    await expect(plugin.onLoad()).resolves.toBeUndefined();
    await expect(plugin.onUnload()).resolves.toBeUndefined();
  });
});
