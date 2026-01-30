import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface VoicePort {
  transcribe(audio: Buffer, language?: string): Promise<string>;
  synthesize(text: string, voiceId?: string): Promise<Buffer>;
}

@Injectable()
export class ElevenLabsAdapter implements VoicePort {
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('elevenlabs.apiKey') || '';
  }

  async transcribe(audio: Buffer, language?: string): Promise<string> {
    throw new Error('STT not implemented - use external service');
  }

  async synthesize(text: string, voiceId?: string): Promise<Buffer> {
    throw new Error('TTS implementation deferred - requires ElevenLabs API integration');
  }
}
