import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ElevenLabsAdapter } from '../adapters/elevenlabs.adapter';

describe('VoiceModule', () => {
  let adapter: ElevenLabsAdapter;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ElevenLabsAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => 'test-key'),
          },
        },
      ],
    }).compile();

    adapter = module.get(ElevenLabsAdapter);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });
});
