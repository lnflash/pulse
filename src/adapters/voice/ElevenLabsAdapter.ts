/**
 * ElevenLabsAdapter — VoicePort TTS implementation using ElevenLabs.
 *
 * Stub — full implementation in Week 5 (Voice sprint).
 */

import type {
  VoicePort,
  TTSOptions,
  TTSResult,
  STTOptions,
  STTResult,
} from '../../ports/VoicePort.js';

export interface ElevenLabsConfig {
  apiKey: string;
  defaultVoiceId?: string;
}

/**
 * ElevenLabsAdapter — high-quality TTS using ElevenLabs.
 * STT is NOT supported by ElevenLabs; use WhisperAdapter for transcription.
 *
 * @todo Week 5: Full TTS implementation
 */
export class ElevenLabsAdapter implements VoicePort {
  private readonly config: ElevenLabsConfig;

  constructor(config: ElevenLabsConfig) {
    this.config = config;
  }

  async textToSpeech(_text: string, _options?: TTSOptions): Promise<TTSResult> {
    throw new Error('ElevenLabsAdapter.textToSpeech not implemented — Week 5');
  }

  async speechToText(_audioBuffer: Buffer, _options?: STTOptions): Promise<STTResult> {
    throw new Error('ElevenLabsAdapter does not support STT — use WhisperAdapter');
  }

  async listVoices(_language?: string): Promise<Array<{ id: string; name: string; language: string }>> {
    throw new Error('ElevenLabsAdapter.listVoices not implemented — Week 5');
  }

  supportsSSML(): boolean { return false; }
  supportsLanguageDetection(): boolean { return false; }
  getProviderName(): string { return 'ElevenLabs'; }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': this.config.apiKey },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch { return false; }
  }
}
