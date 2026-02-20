/**
 * ElevenLabsAdapter — VoicePort TTS implementation using ElevenLabs.
 *
 * Provides high-quality text-to-speech synthesis via the ElevenLabs REST API.
 * Speech-to-text is NOT supported by ElevenLabs — use WhisperAdapter for transcription.
 */

import type {
  VoicePort,
  TTSOptions,
  TTSResult,
  STTOptions,
  STTResult,
} from '../../ports/VoicePort.js';

export interface ElevenLabsConfig {
  /** ElevenLabs API key. Falls back to ELEVENLABS_API_KEY env var if not provided. */
  apiKey?: string;
  /** Default ElevenLabs voice ID to use when none is specified in TTSOptions. */
  defaultVoiceId?: string;
  /** Default ElevenLabs model. Defaults to 'eleven_multilingual_v2'. */
  defaultModel?: string;
}

/** ElevenLabs voice listing response shape. */
interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: { language?: string; accent?: string };
}

/** Supported ElevenLabs output formats and their sample rates. */
const FORMAT_MAP: Record<string, { mimeType: string; sampleRateHz: number }> = {
  mp3:     { mimeType: 'audio/mpeg',   sampleRateHz: 44100 },
  mp3_44100: { mimeType: 'audio/mpeg', sampleRateHz: 44100 },
  pcm_16000: { mimeType: 'audio/pcm',  sampleRateHz: 16000 },
  pcm_22050: { mimeType: 'audio/pcm',  sampleRateHz: 22050 },
  pcm_24000: { mimeType: 'audio/pcm',  sampleRateHz: 24000 },
  ulaw_8000: { mimeType: 'audio/mulaw', sampleRateHz: 8000 },
};

/**
 * ElevenLabsAdapter — implements VoicePort using ElevenLabs TTS API.
 *
 * Usage:
 *   const adapter = new ElevenLabsAdapter({ apiKey: process.env.ELEVENLABS_API_KEY });
 *   const result = await adapter.textToSpeech('Hello world', { voiceId: 'Rachel' });
 */
export class ElevenLabsAdapter implements VoicePort {
  private readonly apiKey: string;
  private readonly defaultVoiceId: string;
  private readonly defaultModel: string;

  constructor(config: ElevenLabsConfig = {}) {
    const key = config.apiKey ?? process.env['ELEVENLABS_API_KEY'];
    if (!key) throw new Error('ElevenLabsAdapter: ELEVENLABS_API_KEY is required');
    this.apiKey = key;
    this.defaultVoiceId = config.defaultVoiceId ?? 'EXAVITQu4vr4xnSDxMaL'; // Rachel (default)
    this.defaultModel = config.defaultModel ?? 'eleven_multilingual_v2';
  }

  /**
   * Convert text to speech audio using ElevenLabs.
   *
   * @param text    Text to synthesize.
   * @param options TTS options (voiceId, speakingRate, etc.)
   * @returns       TTSResult with MP3 audio buffer and metadata.
   */
  async textToSpeech(text: string, options?: TTSOptions): Promise<TTSResult> {
    const voiceId = options?.voiceId ?? this.defaultVoiceId;
    const outputFormat = this.resolveOutputFormat(options);

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${outputFormat}`;

    const body = JSON.stringify({
      text,
      model_id: this.defaultModel,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        // Apply speaking rate if provided (ElevenLabs supports 0.7–1.2 range)
        ...(options?.speakingRate !== undefined && {
          speed: Math.min(Math.max(options.speakingRate, 0.7), 1.2),
        }),
      },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`ElevenLabs TTS error ${response.status}: ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const formatInfo = FORMAT_MAP[outputFormat] ?? FORMAT_MAP['mp3']!;

    // Estimate duration: ~150 words/minute average
    const wordCount = text.trim().split(/\s+/).length;
    const speakingRate = options?.speakingRate ?? 1.0;
    const durationMs = Math.round((wordCount / 150) * 60_000 / speakingRate);

    return {
      audioBuffer,
      encoding: 'mp3',
      sampleRateHz: formatInfo.sampleRateHz,
      durationMs,
    };
  }

  /**
   * ElevenLabs does not support speech-to-text.
   * Use WhisperAdapter for transcription.
   */
  async speechToText(_audioBuffer: Buffer, _options?: STTOptions): Promise<STTResult> {
    throw new Error('ElevenLabsAdapter does not support STT — use WhisperAdapter');
  }

  /**
   * List available ElevenLabs voices, optionally filtered by language.
   */
  async listVoices(language?: string): Promise<Array<{ id: string; name: string; language: string }>> {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs listVoices error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as { voices?: ElevenLabsVoice[] };
    const voices = data.voices ?? [];

    return voices
      .map((v) => ({
        id: v.voice_id,
        name: v.name,
        language: v.labels?.language ?? v.labels?.accent ?? 'en',
      }))
      .filter((v) => !language || v.language.startsWith(language));
  }

  supportsSSML(): boolean { return false; }
  supportsLanguageDetection(): boolean { return false; }
  getProviderName(): string { return 'ElevenLabs'; }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': this.apiKey },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private resolveOutputFormat(options?: TTSOptions): string {
    if (!options?.encoding) return 'mp3_44100_128';
    switch (options.encoding) {
      case 'mp3':  return 'mp3_44100_128';
      case 'wav':  return 'pcm_44100';
      case 'flac': return 'pcm_44100';      // closest available
      default:     return 'mp3_44100_128';
    }
  }
}
