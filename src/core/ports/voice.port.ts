import { UserId } from '../types';

export interface VoiceConfig {
  mode: 'on' | 'off' | 'only';
  selectedVoice?: string;
  selectedVoiceId?: string;
}

export interface VoiceInfo {
  name: string;
  voiceId: string;
  description?: string;
}

export interface VoicePort {
  getVoiceConfig(userId: UserId): Promise<VoiceConfig>;
  setVoiceMode(userId: UserId, mode: 'on' | 'off' | 'only'): Promise<void>;
  selectVoice(userId: UserId, voiceName: string, voiceId: string): Promise<void>;
  listVoices(): Promise<VoiceInfo[]>;
}
