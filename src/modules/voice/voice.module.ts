import { Module } from '@nestjs/common';
import { ElevenLabsAdapter } from './adapters/elevenlabs.adapter';
import { VoiceAdapter } from './adapters/voice.adapter';
import { VOICE_PORT } from '../../core/ports/tokens';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [
    ElevenLabsAdapter,
    VoiceAdapter,
    {
      provide: VOICE_PORT,
      useExisting: VoiceAdapter,
    },
  ],
  exports: [ElevenLabsAdapter, VoiceAdapter, VOICE_PORT],
})
export class VoiceModule {}
