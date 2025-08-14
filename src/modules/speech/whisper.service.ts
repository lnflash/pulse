import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);
  private openai?: OpenAI;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    // Check if OpenAI API key is configured
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (openaiApiKey) {
      try {
        this.openai = new OpenAI({
          apiKey: openaiApiKey,
        });
        this.isConfigured = true;
        this.logger.log('Whisper AI configured successfully');
      } catch (error) {
        this.logger.warn('Failed to initialize Whisper AI:', error);
        this.isConfigured = false;
      }
    } else {
      this.isConfigured = false;
      this.logger.warn('Whisper AI not configured - OPENAI_API_KEY not set');
    }
  }

  /**
   * Transcribe audio to text using Whisper AI (alias for speechToText)
   * @param audioBuffer - Audio buffer containing speech
   * @returns Transcribed text or null if not available
   */
  async transcribeAudio(audioBuffer: Buffer): Promise<string | null> {
    return this.speechToText(audioBuffer, 'audio/ogg; codecs=opus');
  }

  /**
   * Convert speech audio to text using Whisper AI
   * @param audioBuffer - Audio buffer containing speech
   * @param mimeType - MIME type of the audio (e.g., 'audio/ogg; codecs=opus')
   * @returns Transcribed text or null if not available
   */
  async speechToText(audioBuffer: Buffer, mimeType: string): Promise<string | null> {
    if (!this.isConfigured || !this.openai) {
      this.logger.warn('Whisper AI not available - OpenAI not configured');
      return null;
    }

    // Create a temporary file for the audio
    const tempDir = this.configService.get<string>('TEMP_DIR') || '/tmp';

    try {
      // Ensure temp directory exists
      await fs.promises.mkdir(tempDir, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create temp directory ${tempDir}:`, error);
      return null;
    }

    const tempFileName = `whisper-${randomBytes(8).toString('hex')}.${this.getFileExtension(mimeType)}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    try {
      // Write audio buffer to temporary file
      await fs.promises.writeFile(tempFilePath, audioBuffer);

      // Create a ReadStream for the file
      const fileStream = fs.createReadStream(tempFilePath);

      // Use Whisper API to transcribe
      const transcription = await this.openai.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-1',
        language: 'en', // You can make this configurable
        response_format: 'text',
        temperature: 0.2, // Lower temperature for more accurate transcription
      });

      // Clean up the temporary file
      await fs.promises.unlink(tempFilePath).catch((err) => {
        this.logger.warn(`Failed to delete temp file ${tempFilePath}:`, err);
      });

      if (!transcription || typeof transcription !== 'string') {
        this.logger.warn('Empty or invalid transcription result from Whisper');
        return null;
      }

      const trimmedTranscription = transcription.trim();
      if (!trimmedTranscription) {
        this.logger.warn('Empty transcription after trimming');
        return null;
      }

      this.logger.log(`Whisper transcription successful: "${trimmedTranscription}"`);
      return trimmedTranscription;
    } catch (error) {
      // Clean up temp file on error
      await fs.promises.unlink(tempFilePath).catch(() => {});

      this.logger.error('Error transcribing with Whisper:', error);

      if (error.response) {
        this.logger.error(
          `API Error: ${error.response.status} - ${error.response.data?.error?.message}`,
        );
      }

      return null;
    }
  }

  /**
   * Get file extension based on MIME type
   */
  private getFileExtension(mimeType: string): string {
    if (mimeType.includes('ogg') || mimeType.includes('opus')) {
      return 'ogg';
    } else if (mimeType.includes('mp3')) {
      return 'mp3';
    } else if (mimeType.includes('wav')) {
      return 'wav';
    } else if (mimeType.includes('webm')) {
      return 'webm';
    } else if (mimeType.includes('m4a')) {
      return 'm4a';
    } else if (mimeType.includes('flac')) {
      return 'flac';
    }

    // Default to ogg for WhatsApp voice notes
    return 'ogg';
  }

  /**
   * Check if Whisper is available
   */
  isAvailable(): boolean {
    return this.isConfigured;
  }

  /**
   * Get supported audio formats
   */
  getSupportedFormats(): string[] {
    return ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'];
  }
}
