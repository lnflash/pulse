import { Injectable } from '@nestjs/common';
import {
  BasePlugin,
  CommandDefinition,
  ParsedCommand,
  CommandContext,
  PluginResponse,
} from '../interfaces/plugin.interface';
import { RedisService } from '../../redis/redis.service';

interface TranslationCache {
  text: string;
  sourceLang: string;
  targetLang: string;
  translation: string;
  timestamp: number;
}

interface LanguageDetection {
  language: string;
  confidence: number;
}

/**
 * Language translation plugin for multilingual communication
 */
@Injectable()
export class TranslationPlugin extends BasePlugin {
  id = 'translation';
  name = 'Language Translation';
  description = 'Break language barriers with instant translation';
  version = '1.0.0';

  // Supported languages (subset for demo)
  private languages: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    ar: 'Arabic',
    hi: 'Hindi',
    nl: 'Dutch',
    pl: 'Polish',
    tr: 'Turkish',
    vi: 'Vietnamese',
    th: 'Thai',
    id: 'Indonesian',
    ms: 'Malay',
    tl: 'Tagalog',
  };

  // Common phrases for quick translation
  private commonPhrases: Record<string, Record<string, string>> = {
    hello: {
      es: 'Hola',
      fr: 'Bonjour',
      de: 'Hallo',
      it: 'Ciao',
      pt: 'Olá',
      ru: 'Привет',
      ja: 'こんにちは',
      ko: '안녕하세요',
      zh: '你好',
      ar: 'مرحبا',
      hi: 'नमस्ते',
    },
    thanks: {
      es: 'Gracias',
      fr: 'Merci',
      de: 'Danke',
      it: 'Grazie',
      pt: 'Obrigado',
      ru: 'Спасибо',
      ja: 'ありがとう',
      ko: '감사합니다',
      zh: '谢谢',
      ar: 'شكرا',
      hi: 'धन्यवाद',
    },
    yes: {
      es: 'Sí',
      fr: 'Oui',
      de: 'Ja',
      it: 'Sì',
      pt: 'Sim',
      ru: 'Да',
      ja: 'はい',
      ko: '네',
      zh: '是',
      ar: 'نعم',
      hi: 'हाँ',
    },
    no: {
      es: 'No',
      fr: 'Non',
      de: 'Nein',
      it: 'No',
      pt: 'Não',
      ru: 'Нет',
      ja: 'いいえ',
      ko: '아니요',
      zh: '不',
      ar: 'لا',
      hi: 'नहीं',
    },
  };

  commands: CommandDefinition[] = [
    {
      trigger: 'translate',
      aliases: ['tr', 'trans'],
      patterns: [
        /translate\s+(.+)/i,
        /tr\s+(.+)/i,
        /(.+)\s+to\s+(\w+)$/i,
        /what is\s+(.+)\s+in\s+(\w+)/i,
      ],
      description: 'Translate text to another language',
      examples: ['translate hello to spanish', 'tr bonjour', 'what is thank you in japanese'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'detect',
      patterns: [/detect language\s+(.+)/i, /what language is\s+(.+)/i],
      description: 'Detect the language of text',
      examples: ['detect language こんにちは', 'what language is bonjour'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'languages',
      patterns: [/show languages/i, /supported languages/i],
      description: 'Show supported languages',
      examples: ['languages'],
      groupSupported: true,
      requiresAuth: false,
    },
    {
      trigger: 'autotranslate',
      patterns: [/auto translate/i, /enable translation/i],
      description: 'Enable automatic translation in group',
      examples: ['autotranslate on', 'autotranslate off'],
      groupSupported: true,
      requiresAuth: false,
    },
  ];

  constructor(private redisService: RedisService) {
    super();
  }

  async handleCommand(command: ParsedCommand, context: CommandContext): Promise<PluginResponse> {
    switch (command.trigger.toLowerCase()) {
      case 'translate':
      case 'tr':
      case 'trans':
        return this.handleTranslate(command, context);
      case 'detect':
        return this.handleDetect(command, context);
      case 'languages':
        return this.showLanguages();
      case 'autotranslate':
        return this.handleAutoTranslate(command, context);
      default:
        // Check for pattern-based translation
        if (
          command.rawText.match(/(.+)\s+to\s+(\w+)$/i) ||
          command.rawText.match(/what is\s+(.+)\s+in\s+(\w+)/i)
        ) {
          return this.handleTranslate(command, context);
        }
        return {
          text: '❓ Unknown translation command',
        };
    }
  }

  private async handleTranslate(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    let text: string;
    let targetLang: string | undefined;

    // Parse different command formats
    const toMatch = command.rawText.match(/(.+)\s+to\s+(\w+)$/i);
    const whatIsMatch = command.rawText.match(/what is\s+(.+)\s+in\s+(\w+)/i);

    if (toMatch) {
      text = toMatch[1]
        .replace(/^translate\s+/i, '')
        .replace(/^tr\s+/i, '')
        .trim();
      targetLang = this.parseLanguageCode(toMatch[2]);
    } else if (whatIsMatch) {
      text = whatIsMatch[1].trim();
      targetLang = this.parseLanguageCode(whatIsMatch[2]);
    } else {
      // Simple format: translate [text]
      text = command.args.join(' ') || command.rawText.replace(/^(translate|tr|trans)\s+/i, '');

      // Try to detect if last word is a language
      const words = text.split(' ');
      const lastWord = words[words.length - 1].toLowerCase();
      const langCode = this.parseLanguageCode(lastWord);

      if (langCode && words.length > 1) {
        targetLang = langCode;
        text = words.slice(0, -1).join(' ');
      }
    }

    if (!text) {
      return {
        text: '❌ Please provide text to translate!\n\nExample: translate hello to spanish',
      };
    }

    // Check cache
    const cacheKey = `translate:${text}:${targetLang || 'auto'}`;
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      const cache: TranslationCache = JSON.parse(cached);
      return this.formatTranslationResponse(cache);
    }

    // Detect source language
    const sourceLang = this.detectLanguage(text);

    // If no target language specified, translate to English or from English
    if (!targetLang) {
      targetLang = sourceLang.language === 'en' ? 'es' : 'en';
    }

    // Perform translation (simulated)
    const translation = await this.translateText(text, sourceLang.language, targetLang);

    // Cache result
    const result: TranslationCache = {
      text,
      sourceLang: sourceLang.language,
      targetLang,
      translation,
      timestamp: Date.now(),
    };

    await this.redisService.set(cacheKey, JSON.stringify(result), 3600); // 1 hour cache

    return this.formatTranslationResponse(result);
  }

  private async handleDetect(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    const text =
      command.args.join(' ') ||
      command.rawText.replace(/^(detect language|what language is)\s+/i, '');

    if (!text) {
      return {
        text: '❌ Please provide text to detect language!',
      };
    }

    const detection = this.detectLanguage(text);
    const languageName = this.languages[detection.language] || 'Unknown';

    let response = `🔍 *Language Detection*\n\n`;
    response += `Text: "${text}"\n`;
    response += `Language: ${languageName} (${detection.language})\n`;
    response += `Confidence: ${Math.round(detection.confidence * 100)}%`;

    if (detection.confidence < 0.7) {
      response += '\n\n⚠️ Low confidence - the text might be too short or mixed languages.';
    }

    return {
      text: response,
      showTyping: true,
      delay: 300,
    };
  }

  private showLanguages(): PluginResponse {
    let text = '🌍 *Supported Languages*\n\n';

    const langs = Object.entries(this.languages).sort((a, b) => a[1].localeCompare(b[1]));

    langs.forEach(([code, name]) => {
      text += `• ${name} (${code})\n`;
    });

    text += '\n💡 Use language name or code in translation commands.';

    return {
      text,
      showTyping: true,
      delay: 400,
    };
  }

  private async handleAutoTranslate(
    command: ParsedCommand,
    context: CommandContext,
  ): Promise<PluginResponse> {
    if (!context.isGroup) {
      return {
        text: '❌ Auto-translate is only available in group chats!',
      };
    }

    const args = command.args.join(' ').toLowerCase();
    const enable = args.includes('on') || args.includes('enable');
    const disable = args.includes('off') || args.includes('disable');

    if (!enable && !disable) {
      return {
        text: '❌ Please specify "on" or "off"\n\nExample: autotranslate on',
      };
    }

    const settingKey = `autotranslate:${context.groupId}`;

    if (enable) {
      // Store user's preferred language
      const userLang = await this.getUserLanguage(context.userId);
      await this.redisService.set(settingKey, 'enabled', 86400 * 7); // 7 days

      return {
        text:
          `🌐 *Auto-translate enabled!*\n\n` +
          `Messages in foreign languages will be automatically translated.\n` +
          `Your language: ${this.languages[userLang] || 'English'}\n\n` +
          `To disable: autotranslate off`,
      };
    } else {
      await this.redisService.del(settingKey);

      return {
        text: '🌐 Auto-translate disabled.',
      };
    }
  }

  private formatTranslationResponse(cache: TranslationCache): PluginResponse {
    const sourceLangName = this.languages[cache.sourceLang] || cache.sourceLang;
    const targetLangName = this.languages[cache.targetLang] || cache.targetLang;

    let text = `🌐 *Translation*\n\n`;
    text += `${this.getLanguageEmoji(cache.sourceLang)} ${sourceLangName}: "${cache.text}"\n`;
    text += `${this.getLanguageEmoji(cache.targetLang)} ${targetLangName}: "${cache.translation}"`;

    // Add pronunciation guide for certain languages
    const pronunciation = this.getPronunciation(cache.translation, cache.targetLang);
    if (pronunciation) {
      text += `\n🔊 Pronunciation: ${pronunciation}`;
    }

    return {
      text,
      showTyping: true,
      delay: 500,
    };
  }

  private detectLanguage(text: string): LanguageDetection {
    // Simple language detection based on character sets and common words
    // In production, this would use a proper language detection library

    // Check for specific scripts
    if (/[\u4e00-\u9fff]/.test(text)) return { language: 'zh', confidence: 0.9 };
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return { language: 'ja', confidence: 0.9 };
    if (/[\uac00-\ud7af]/.test(text)) return { language: 'ko', confidence: 0.9 };
    if (/[\u0600-\u06ff]/.test(text)) return { language: 'ar', confidence: 0.9 };
    if (/[\u0400-\u04ff]/.test(text)) return { language: 'ru', confidence: 0.9 };
    if (/[\u0900-\u097f]/.test(text)) return { language: 'hi', confidence: 0.9 };

    // Check common words
    const lowerText = text.toLowerCase();

    if (lowerText.includes('hello') || lowerText.includes('the') || lowerText.includes('is')) {
      return { language: 'en', confidence: 0.8 };
    }
    if (lowerText.includes('hola') || lowerText.includes('el') || lowerText.includes('es')) {
      return { language: 'es', confidence: 0.8 };
    }
    if (lowerText.includes('bonjour') || lowerText.includes('le') || lowerText.includes('est')) {
      return { language: 'fr', confidence: 0.8 };
    }
    if (lowerText.includes('hallo') || lowerText.includes('der') || lowerText.includes('ist')) {
      return { language: 'de', confidence: 0.8 };
    }

    // Default to English with low confidence
    return { language: 'en', confidence: 0.5 };
  }

  private async translateText(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string> {
    // Check common phrases first
    const lowerText = text.toLowerCase().trim();

    for (const [phrase, translations] of Object.entries(this.commonPhrases)) {
      if (lowerText === phrase && translations[targetLang]) {
        return translations[targetLang];
      }
    }

    // Simulated translation for demo
    // In production, this would call a translation API
    const translations: Record<string, Record<string, string>> = {
      'hello world': {
        es: 'Hola mundo',
        fr: 'Bonjour le monde',
        de: 'Hallo Welt',
        it: 'Ciao mondo',
        pt: 'Olá mundo',
        ja: 'ハローワールド',
        ko: '헬로 월드',
        zh: '你好世界',
      },
      'good morning': {
        es: 'Buenos días',
        fr: 'Bonjour',
        de: 'Guten Morgen',
        it: 'Buongiorno',
        pt: 'Bom dia',
        ja: 'おはようございます',
        ko: '좋은 아침',
        zh: '早上好',
      },
      'how are you': {
        es: '¿Cómo estás?',
        fr: 'Comment allez-vous?',
        de: 'Wie geht es dir?',
        it: 'Come stai?',
        pt: 'Como você está?',
        ja: '元気ですか',
        ko: '어떻게 지내세요?',
        zh: '你好吗？',
      },
    };

    const key = lowerText;
    if (translations[key] && translations[key][targetLang]) {
      return translations[key][targetLang];
    }

    // Simple word-by-word translation for demo
    const wordTranslations: Record<string, Record<string, string>> = {
      i: { es: 'yo', fr: 'je', de: 'ich', it: 'io', pt: 'eu' },
      you: { es: 'tú', fr: 'tu', de: 'du', it: 'tu', pt: 'você' },
      love: { es: 'amor', fr: 'amour', de: 'liebe', it: 'amore', pt: 'amor' },
      bitcoin: { es: 'bitcoin', fr: 'bitcoin', de: 'bitcoin', it: 'bitcoin', pt: 'bitcoin' },
    };

    const words = text.split(' ');
    const translatedWords = words.map((word) => {
      const lower = word.toLowerCase();
      if (wordTranslations[lower] && wordTranslations[lower][targetLang]) {
        return wordTranslations[lower][targetLang];
      }
      return word;
    });

    return translatedWords.join(' ');
  }

  private parseLanguageCode(input: string): string | undefined {
    const lower = input.toLowerCase();

    // Check if it's already a valid code
    if (this.languages[lower]) {
      return lower;
    }

    // Check language names
    for (const [code, name] of Object.entries(this.languages)) {
      if (name.toLowerCase() === lower) {
        return code;
      }
    }

    // Check common variations
    const variations: Record<string, string> = {
      spanish: 'es',
      english: 'en',
      french: 'fr',
      german: 'de',
      italian: 'it',
      portuguese: 'pt',
      russian: 'ru',
      japanese: 'ja',
      korean: 'ko',
      chinese: 'zh',
      arabic: 'ar',
      hindi: 'hi',
    };

    return variations[lower];
  }

  private getLanguageEmoji(langCode: string): string {
    const flags: Record<string, string> = {
      en: '🇬🇧',
      es: '🇪🇸',
      fr: '🇫🇷',
      de: '🇩🇪',
      it: '🇮🇹',
      pt: '🇵🇹',
      ru: '🇷🇺',
      ja: '🇯🇵',
      ko: '🇰🇷',
      zh: '🇨🇳',
      ar: '🇸🇦',
      hi: '🇮🇳',
      nl: '🇳🇱',
      pl: '🇵🇱',
      tr: '🇹🇷',
      vi: '🇻🇳',
      th: '🇹🇭',
      id: '🇮🇩',
      ms: '🇲🇾',
      tl: '🇵🇭',
    };

    return flags[langCode] || '🌐';
  }

  private getPronunciation(text: string, langCode: string): string | undefined {
    // Simple pronunciation guide for demo
    const pronunciations: Record<string, Record<string, string>> = {
      こんにちは: { ja: 'kon-ni-chi-wa' },
      ありがとう: { ja: 'a-ri-ga-tō' },
      你好: { zh: 'nǐ hǎo' },
      谢谢: { zh: 'xiè xie' },
      안녕하세요: { ko: 'an-nyeong-ha-se-yo' },
      감사합니다: { ko: 'gam-sa-ham-ni-da' },
    };

    return pronunciations[text]?.[langCode];
  }

  private async getUserLanguage(userId: string): Promise<string> {
    const key = `user:language:${userId}`;
    const lang = await this.redisService.get(key);
    return lang || 'en';
  }
}
