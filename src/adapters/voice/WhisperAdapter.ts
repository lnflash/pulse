/**
 * WhisperAdapter — VoicePort STT implementation using OpenAI Whisper.
 *
 * Transcribes audio buffers using the OpenAI /v1/audio/transcriptions endpoint.
 * Text-to-speech is NOT supported — use ElevenLabsAdapter for voice synthesis.
 */

import type {
  VoicePort,
  TTSOptions,
  TTSResult,
  STTOptions,
  STTResult,
} from '../../ports/VoicePort.js';

export interface WhisperConfig {
  /** OpenAI API key. Falls back to OPENAI_API_KEY env var if not provided. */
  apiKey?: string;
  /** Whisper model to use. Defaults to 'whisper-1'. */
  model?: string;
}

/** Whisper verbose_json response shape. */
interface WhisperVerboseResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
    avg_logprob: number;
  }>;
}

/** MIME type mapping for audio encodings. */
const ENCODING_MIME: Record<string, { mime: string; ext: string }> = {
  mp3:      { mime: 'audio/mpeg',    ext: 'mp3' },
  wav:      { mime: 'audio/wav',     ext: 'wav' },
  flac:     { mime: 'audio/flac',    ext: 'flac' },
  ogg_opus: { mime: 'audio/ogg',     ext: 'ogg' },
  webm:     { mime: 'audio/webm',    ext: 'webm' },
  aac:      { mime: 'audio/aac',     ext: 'aac' },
};

/**
 * WhisperAdapter — speech-to-text via OpenAI Whisper API.
 *
 * Usage:
 *   const adapter = new WhisperAdapter({ apiKey: process.env.OPENAI_API_KEY });
 *   const result = await adapter.speechToText(audioBuffer, { language: 'en' });
 */
export class WhisperAdapter implements VoicePort {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: WhisperConfig = {}) {
    const key = config.apiKey ?? process.env['OPENAI_API_KEY'];
    if (!key) throw new Error('WhisperAdapter: OPENAI_API_KEY is required');
    this.apiKey = key;
    this.model = config.model ?? 'whisper-1';
  }

  /**
   * WhisperAdapter does not support TTS.
   * Use ElevenLabsAdapter for voice synthesis.
   */
  async textToSpeech(_text: string, _options?: TTSOptions): Promise<TTSResult> {
    throw new Error('WhisperAdapter does not support TTS — use ElevenLabsAdapter');
  }

  /**
   * Transcribe an audio buffer using OpenAI Whisper.
   *
   * @param audioBuffer Raw audio bytes to transcribe.
   * @param options     STT options (language hint, encoding, hints, etc.)
   * @returns           Transcription result with text, confidence, and metadata.
   */
  async speechToText(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult> {
    const { mime, ext } = this.resolveAudioFormat(options);

    // Build multipart/form-data payload
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: mime });
    const audioFile = new File([audioBlob], `audio.${ext}`, { type: mime });

    formData.append('file', audioFile);
    formData.append('model', this.model);
    formData.append('response_format', 'verbose_json');

    // Add language hint if provided (improves accuracy and avoids auto-detect overhead)
    if (options?.language) {
      // Whisper expects the base language code (e.g. 'en' from 'en-JM')
      const langCode = options.language.split('-')[0] ?? options.language;
      formData.append('language', langCode);
    }

    // Add domain-specific hint phrases as a prompt to improve recognition
    if (options?.hints && options.hints.length > 0) {
      formData.append('prompt', options.hints.join(', '));
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        // Do NOT set Content-Type manually — fetch sets it with the correct boundary
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Whisper STT error ${response.status}: ${errText}`);
    }

    const data = await response.json() as WhisperVerboseResponse;

    const transcript = data.text?.trim() ?? '';
    const audioDurationMs = data.duration ? Math.round(data.duration * 1000) : 0;

    // Derive confidence from segment log-probabilities if available
    const confidence = this.estimateConfidence(data);

    // Build alternative transcripts from segments if available (best effort)
    const alternatives = data.segments && data.segments.length > 1
      ? data.segments.slice(0, 3).map((seg) => ({
          transcript: seg.text.trim(),
          confidence: Math.exp(Math.max(seg.avg_logprob, -5)) * 0.9,
        }))
      : undefined;

    return {
      transcript,
      confidence,
      alternatives,
      detectedLanguage: data.language,
      audioDurationMs,
    };
  }

  /**
   * Whisper does not have selectable voices — returns an empty list.
   */
  async listVoices(): Promise<Array<{ id: string; name: string; language: string }>> {
    return [];
  }

  supportsSSML(): boolean { return false; }
  supportsLanguageDetection(): boolean { return true; }
  getProviderName(): string { return 'OpenAI Whisper'; }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private resolveAudioFormat(options?: STTOptions): { mime: string; ext: string } {
    const encoding = options?.encoding;
    if (encoding && ENCODING_MIME[encoding]) {
      return ENCODING_MIME[encoding]!;
    }
    // Default to MP3
    return ENCODING_MIME['mp3']!;
  }

  /**
   * Estimate overall transcription confidence from segment log-probabilities.
   * Falls back to 0.85 (Whisper is generally very accurate) if no segments available.
   */
  private estimateConfidence(data: WhisperVerboseResponse): number {
    if (!data.segments || data.segments.length === 0) return 0.85;

    const avgLogProb =
      data.segments.reduce((sum, s) => sum + s.avg_logprob, 0) / data.segments.length;

    // Convert log-prob to a rough probability (clamped to [0, 1])
    return Math.min(Math.max(Math.exp(avgLogProb), 0), 1);
  }
}
