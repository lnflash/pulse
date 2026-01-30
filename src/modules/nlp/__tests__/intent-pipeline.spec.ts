import { IntentPipelineService } from '../pipeline/intent-pipeline.service';
import { Intent } from '../../../core/types';

describe('IntentPipelineService', () => {
  let service: IntentPipelineService;

  beforeEach(() => {
    service = new IntentPipelineService();
  });

  it('should classify balance intent', async () => {
    const result = await service.classify('check my balance');
    expect(result.kind).toBe('core');
    if (result.kind === 'core') {
      expect(result.intent).toBe(Intent.CheckBalance);
    }
  });

  it('should classify help intent', async () => {
    const result = await service.classify('help');
    expect(result.kind).toBe('core');
    if (result.kind === 'core') {
      expect(result.intent).toBe(Intent.Help);
    }
  });

  it('should fallback to conversational', async () => {
    const result = await service.classify('hello there');
    expect(result.kind).toBe('core');
    if (result.kind === 'core') {
      expect(result.intent).toBe(Intent.Conversational);
    }
  });
});
