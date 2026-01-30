import { Module } from '@nestjs/common';
import { ElevenLabsAdapter } from './adapters/elevenlabs.adapter';

@Module({
  providers: [ElevenLabsAdapter],
  exports: [ElevenLabsAdapter],
})
export class VoiceModule {}
