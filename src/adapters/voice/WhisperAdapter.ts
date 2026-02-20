/**
 * WhisperAdapter — VoicePort STT implementation using OpenAI Whisper.
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

export interface WhisperConfig {
  apiKey: string;
  model?: string;
}

/**
 * WhisperAdapter — speech-to-text via OpenAI Whisper.
 * TTS is not supported; use ElevenLabsAdapter for voice synthesis.
 *
 * @todo Week 5: Full STT implementation
 */
export class WhisperAdapter implements VoicePort {
  private readonly config: WhisperConfig;

  constructor(config: WhisperConfig) {
    this.config = { model: 'whisper-1', ...config };
  }

  async textToSpeech(_text: string, _options?: TTSOptions): Promise<TTSResult> {
    throw new Error('WhisperAdapter does not support TTS — use ElevenLabsAdapter');
  }

  async speechToText(_audioBuffer: Buffer, _options?: STTOptions): Promise<STTResult> {
    throw new Error('WhisperAdapter.speechToText not implemented — Week 5');
  }

  async listVoices(): Promise<Array<{ id: string; name: string; language: string }>> {
    return []; // Whisper doesn't have selectable voices
  }

  supportsSSML(): boolean { return false; }
  supportsLanguageDetection(): boolean { return true; }
  getProviderName(): string { return 'OpenAI Whisper'; }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch { return false; }
  }
}
