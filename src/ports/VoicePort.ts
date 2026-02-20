/**
 * VoicePort — hexagonal boundary for voice/audio processing adapters.
 * Handles text-to-speech synthesis and speech-to-text transcription.
 */

/** Supported audio encoding formats. */
export type AudioEncoding =
  | 'ogg_opus'
  | 'mp3'
  | 'wav'
  | 'flac'
  | 'webm'
  | 'aac';

/** Options for text-to-speech synthesis. */
export interface TTSOptions {
  /**
   * Language/locale code, e.g. 'en-JM' (Jamaican English), 'en-TT', 'es-PR'.
   * Falls back to adapter default if not specified.
   */
  language?: string;
  /**
   * Voice ID or name specific to the TTS provider.
   * E.g. ElevenLabs voice ID, Google voice name, etc.
   */
  voiceId?: string;
  /** Speaking rate multiplier. 1.0 = normal speed. Range: 0.5–2.0 */
  speakingRate?: number;
  /** Pitch adjustment in semitones. 0.0 = normal pitch. Range: -12 to +12 */
  pitch?: number;
  /** Output audio encoding format. */
  encoding?: AudioEncoding;
  /**
   * Audio sample rate in Hz.
   * 16000 for voice messages (WhatsApp), 24000+ for high quality.
   */
  sampleRateHz?: number;
}

/** Result of text-to-speech synthesis. */
export interface TTSResult {
  /** Raw audio bytes in the requested encoding. */
  audioBuffer: Buffer;
  /** Actual encoding of the audio. */
  encoding: AudioEncoding;
  /** Sample rate of the audio in Hz. */
  sampleRateHz: number;
  /** Duration of the audio in milliseconds. */
  durationMs: number;
}

/** Options for speech-to-text transcription. */
export interface STTOptions {
  /**
   * Expected language/locale code. Providing this improves accuracy.
   * E.g. 'en-JM', 'en-TT', 'es-PR'.
   */
  language?: string;
  /**
   * Hint phrases to improve recognition of domain-specific terms.
   * E.g. ['Flash', 'Bitcoin', 'Satoshi', 'lightning invoice'].
   */
  hints?: string[];
  /**
   * Audio encoding of the input buffer.
   * If omitted, the adapter will attempt auto-detection.
   */
  encoding?: AudioEncoding;
  /** Sample rate of the input audio in Hz. */
  sampleRateHz?: number;
  /**
   * Enable automatic punctuation in the transcript.
   */
  enablePunctuation?: boolean;
  /**
   * Enable profanity filtering.
   */
  profanityFilter?: boolean;
}

/** A word-level timing entry in the transcript. */
export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

/** Result of speech-to-text transcription. */
export interface STTResult {
  /**
   * Primary transcription (best hypothesis).
   */
  transcript: string;
  /**
   * Confidence score of the primary transcript. Range: 0.0–1.0.
   */
  confidence: number;
  /**
   * Alternative transcriptions, ordered by decreasing confidence.
   */
  alternatives?: Array<{ transcript: string; confidence: number }>;
  /**
   * Detected language code, if auto-detection was requested.
   */
  detectedLanguage?: string;
  /**
   * Word-level timing data (if supported by the provider).
   */
  wordTimings?: WordTiming[];
  /** Duration of the audio that was transcribed, in milliseconds. */
  audioDurationMs: number;
}

/**
 * VoicePort — implement this for every voice processing backend.
 *
 * Implementations must be stateless. Audio is passed as Buffers.
 */
export interface VoicePort {
  /**
   * Convert text to speech audio.
   * @param text Text to synthesize. SSML is supported if the adapter declares it.
   * @param options TTS configuration options.
   * @returns Synthesized audio buffer and metadata.
   */
  textToSpeech(text: string, options?: TTSOptions): Promise<TTSResult>;

  /**
   * Convert speech audio to text.
   * @param audioBuffer Raw audio bytes to transcribe.
   * @param options STT configuration options.
   * @returns Transcription result with confidence and alternatives.
   */
  speechToText(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult>;

  /**
   * List available voices for the given language.
   * @param language Optional language code filter.
   * @returns List of available voice IDs/names.
   */
  listVoices(
    language?: string,
  ): Promise<Array<{ id: string; name: string; language: string }>>;

  /**
   * Whether this adapter supports SSML markup in textToSpeech().
   */
  supportsSSML(): boolean;

  /**
   * Whether this adapter can auto-detect the language from audio.
   */
  supportsLanguageDetection(): boolean;

  /** Human-readable provider name, e.g. 'ElevenLabs', 'Google Cloud TTS'. */
  getProviderName(): string;

  /**
   * Health check — returns true if the voice API is reachable.
   */
  ping(): Promise<boolean>;
}
