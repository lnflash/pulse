import { DecisionPlugin } from './decision.plugin';
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

describe('DecisionPlugin', () => {
  let plugin: DecisionPlugin;

  beforeEach(() => {
    plugin = new DecisionPlugin(mockSession as any);
  });

  it('has correct id and name', () => {
    expect(plugin.id).toBe('decision-making');
    expect(plugin.name).toBe('Group Decision Making');
  });

  it('provides recognizers', () => {
    const recs = plugin.getRecognizers();
    expect(recs.length).toBeGreaterThanOrEqual(5);
  });

  it('rejects non-group context', async () => {
    const result = await plugin.execute('decide', ctx({ isGroup: false }));
    expect((result.text[0] as any).value).toContain('only available in group');
  });

  it('starts a yes/no decision', async () => {
    const result = await plugin.execute(
      'decide',
      ctx({ rawText: 'decide Should we meet Friday?' }),
    );
    const text = (result.text[0] as any).value;
    expect(text).toContain('New Decision');
    expect(text).toContain('Yes');
    expect(text).toContain('No');
  });

  it('starts a multi-option decision', async () => {
    const result = await plugin.execute(
      'decide',
      ctx({ rawText: 'decide Best tool? | React | Vue | Angular' }),
    );
    expect((result.text[0] as any).value).toContain('React');
  });

  it('prevents duplicate decisions', async () => {
    await plugin.execute('decide', ctx({ rawText: 'decide Q1?' }));
    const result = await plugin.execute('decide', ctx({ rawText: 'decide Q2?' }));
    expect((result.text[0] as any).value).toContain('already an active decision');
  });

  it('handles voting', async () => {
    await plugin.execute('decide', ctx({ rawText: 'decide Q? | A | B' }));
    const result = await plugin.execute('vote', ctx({ rawText: 'vote 1' }));
    expect((result.text[0] as any).value).toContain('Vote recorded');
  });

  it('starts consensus process', async () => {
    const result = await plugin.execute(
      'consensus',
      ctx({ rawText: 'consensus Should we pivot?' }),
    );
    expect((result.text[0] as any).value).toContain('Consensus Decision');
  });

  it('adds discussion comment', async () => {
    await plugin.execute('decide', ctx({ rawText: 'decide Q?' }));
    const result = await plugin.execute('discuss', ctx({ rawText: 'discuss I think yes' }));
    expect((result.text[0] as any).value).toContain('Comment added');
  });

  it('adds pros', async () => {
    await plugin.execute('decide', ctx({ rawText: 'decide Q? | A | B' }));
    const result = await plugin.execute('pros', ctx({ rawText: 'pro 1: Fast implementation' }));
    expect((result.text[0] as any).value).toContain('PRO added');
  });

  it('adds cons', async () => {
    await plugin.execute('decide', ctx({ rawText: 'decide Q? | A | B' }));
    const result = await plugin.execute('cons', ctx({ rawText: 'con 1: Too expensive' }));
    expect((result.text[0] as any).value).toContain('CON added');
  });

  it('shows decision status', async () => {
    await plugin.execute('decide', ctx({ rawText: 'decide Q? | A | B' }));
    const result = await plugin.execute('status', ctx());
    expect((result.text[0] as any).value).toContain('Decision Status');
  });

  it('consensus blocks and unblocks', async () => {
    await plugin.execute('consensus', ctx({ rawText: 'consensus Topic' }));
    const block = await plugin.execute('discuss', ctx({ rawText: 'discuss I block this' }));
    expect((block.text[0] as any).value).toContain('Blocking consensus');

    const support = await plugin.execute('discuss', ctx({ rawText: 'discuss I support this' }));
    expect((support.text[0] as any).value).toContain('Consensus reached');
  });

  it('onLoad and onUnload work', async () => {
    await expect(plugin.onLoad()).resolves.toBeUndefined();
    await expect(plugin.onUnload()).resolves.toBeUndefined();
  });
});
