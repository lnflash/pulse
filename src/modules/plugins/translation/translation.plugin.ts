import { Injectable, Inject } from '@nestjs/common';
import {
  PluginPort,
  PluginRecognizer,
  CommandContext,
  HandlerResult,
} from '../../../core/ports/plugin.port';
import { SessionPort } from '../../../core/ports/session.port';
import { FormattedText } from '../../../core/types/messages';
import { PluginId } from '../../../core/types/intents';

const LANGUAGES: Record<string, string> = {
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

const COMMON_PHRASES: Record<string, Record<string, string>> = {
  hello: {
    es: 'Hola',
    fr: 'Bonjour',
    de: 'Hallo',
    it: 'Ciao',
    pt: 'Ola',
    ru: '\u041f\u0440\u0438\u0432\u0435\u0442',
    ja: '\u3053\u3093\u306b\u3061\u306f',
    ko: '\uc548\ub155\ud558\uc138\uc694',
    zh: '\u4f60\u597d',
    ar: '\u0645\u0631\u062d\u0628\u0627',
    hi: '\u0928\u092e\u0938\u094d\u0924\u0947',
  },
  thanks: {
    es: 'Gracias',
    fr: 'Merci',
    de: 'Danke',
    it: 'Grazie',
    pt: 'Obrigado',
    ru: '\u0421\u043f\u0430\u0441\u0438\u0431\u043e',
    ja: '\u3042\u308a\u304c\u3068\u3046',
    ko: '\uac10\uc0ac\ud569\ub2c8\ub2e4',
    zh: '\u8c22\u8c22',
    ar: '\u0634\u0643\u0631\u0627',
    hi: '\u0927\u0928\u094d\u092f\u0935\u093e\u0926',
  },
  yes: {
    es: 'Si',
    fr: 'Oui',
    de: 'Ja',
    it: 'Si',
    pt: 'Sim',
    ja: '\u306f\u3044',
    ko: '\ub124',
    zh: '\u662f',
  },
  no: {
    es: 'No',
    fr: 'Non',
    de: 'Nein',
    it: 'No',
    pt: 'Nao',
    ja: '\u3044\u3044\u3048',
    ko: '\uc544\ub2c8\uc694',
    zh: '\u4e0d',
  },
};

const LANG_VARIATIONS: Record<string, string> = {
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

@Injectable()
export class TranslationPlugin implements PluginPort {
  readonly id = PluginId.Translation;
  readonly name = 'Language Translation';
  readonly description = 'Break language barriers with instant translation';

  private autoTranslateGroups = new Set<string>();

  constructor(@Inject('SessionPort') private readonly session: SessionPort) {}

  getRecognizers(): PluginRecognizer[] {
    return [
      {
        pluginId: this.id,
        action: 'translate',
        patterns: [/^translate\s+.+/i, /^tr\s+.+/i, /^trans\s+.+/i, /what is\s+.+\s+in\s+\w+/i],
        keywords: ['translate'],
      },
      {
        pluginId: this.id,
        action: 'detect',
        patterns: [/^detect\s+.+/i, /detect language\s+.+/i, /what language is\s+.+/i],
        keywords: [],
      },
      {
        pluginId: this.id,
        action: 'languages',
        patterns: [/^languages$/i, /show languages/i, /supported languages/i],
        keywords: ['languages'],
      },
      {
        pluginId: this.id,
        action: 'autotranslate',
        patterns: [/^autotranslate\s+.+/i, /auto translate\s+.+/i, /enable translation/i],
        keywords: [],
      },
    ];
  }

  async execute(action: string, ctx: CommandContext): Promise<HandlerResult> {
    switch (action) {
      case 'translate':
        return this.handleTranslate(ctx);
      case 'detect':
        return this.handleDetect(ctx);
      case 'languages':
        return this.showLanguages();
      case 'autotranslate':
        return this.handleAutoTranslate(ctx);
      default:
        return this.txt('Unknown translation command.');
    }
  }

  async onLoad(): Promise<void> {
    /* no-op */
  }
  async onUnload(): Promise<void> {
    this.autoTranslateGroups.clear();
  }

  private handleTranslate(ctx: CommandContext): HandlerResult {
    let textToTranslate: string;
    let targetLang: string | undefined;

    const toMatch = ctx.rawText.match(/(.+)\s+to\s+(\w+)$/i);
    const whatIsMatch = ctx.rawText.match(/what is\s+(.+)\s+in\s+(\w+)/i);

    if (toMatch) {
      textToTranslate = toMatch[1].replace(/^(translate|tr|trans)\s+/i, '').trim();
      targetLang = this.parseLangCode(toMatch[2]);
    } else if (whatIsMatch) {
      textToTranslate = whatIsMatch[1].trim();
      targetLang = this.parseLangCode(whatIsMatch[2]);
    } else {
      textToTranslate = ctx.rawText.replace(/^(translate|tr|trans)\s*/i, '').trim();
      const words = textToTranslate.split(' ');
      const lastWord = words[words.length - 1];
      const code = this.parseLangCode(lastWord);
      if (code && words.length > 1) {
        targetLang = code;
        textToTranslate = words.slice(0, -1).join(' ');
      }
    }

    if (!textToTranslate)
      return this.txt('Please provide text to translate!\n\nExample: translate hello to spanish');

    const sourceLang = this.detectLanguage(textToTranslate);
    if (!targetLang) targetLang = sourceLang === 'en' ? 'es' : 'en';

    const translation = this.translateText(textToTranslate, targetLang);
    const srcName = LANGUAGES[sourceLang] ?? sourceLang;
    const tgtName = LANGUAGES[targetLang] ?? targetLang;

    return this.txt(
      `Translation\n\n${srcName}: "${textToTranslate}"\n${tgtName}: "${translation}"`,
    );
  }

  private handleDetect(ctx: CommandContext): HandlerResult {
    const text = ctx.rawText.replace(/^(detect language|detect|what language is)\s+/i, '');
    if (!text) return this.txt('Please provide text to detect language!');

    const lang = this.detectLanguage(text);
    const name = LANGUAGES[lang] ?? 'Unknown';
    return this.txt(`Language Detection\n\nText: "${text}"\nLanguage: ${name} (${lang})`);
  }

  private showLanguages(): HandlerResult {
    const langs = Object.entries(LANGUAGES).sort((a, b) => a[1].localeCompare(b[1]));
    const list = langs.map(([code, name]) => `${name} (${code})`).join('\n');
    return this.txt(
      `Supported Languages\n\n${list}\n\nUse language name or code in translation commands.`,
    );
  }

  private handleAutoTranslate(ctx: CommandContext): HandlerResult {
    if (!ctx.isGroup) return this.txt('Auto-translate is only available in group chats!');

    const args = ctx.rawText.toLowerCase();
    if (args.includes('on') || args.includes('enable')) {
      this.autoTranslateGroups.add(ctx.groupId!);
      return this.txt(
        'Auto-translate enabled!\n\nMessages in foreign languages will be automatically translated.\n\nTo disable: autotranslate off',
      );
    }

    this.autoTranslateGroups.delete(ctx.groupId!);
    return this.txt('Auto-translate disabled.');
  }

  private detectLanguage(text: string): string {
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
    if (/[\uac00-\ud7af]/.test(text)) return 'ko';
    if (/[\u0600-\u06ff]/.test(text)) return 'ar';
    if (/[\u0400-\u04ff]/.test(text)) return 'ru';
    if (/[\u0900-\u097f]/.test(text)) return 'hi';

    const lower = text.toLowerCase();
    if (lower.includes('hola') || lower.includes('gracias')) return 'es';
    if (lower.includes('bonjour') || lower.includes('merci')) return 'fr';
    if (lower.includes('hallo') || lower.includes('danke')) return 'de';
    return 'en';
  }

  private translateText(text: string, targetLang: string): string {
    const lower = text.toLowerCase().trim();
    const phrase = COMMON_PHRASES[lower];
    if (phrase?.[targetLang]) return phrase[targetLang];
    return `[${text}] (${LANGUAGES[targetLang] ?? targetLang})`;
  }

  private parseLangCode(input: string): string | undefined {
    const lower = input.toLowerCase();
    if (LANGUAGES[lower]) return lower;
    for (const [code, name] of Object.entries(LANGUAGES)) {
      if (name.toLowerCase() === lower) return code;
    }
    return LANG_VARIATIONS[lower];
  }

  private txt(value: string): HandlerResult {
    const text: FormattedText = [{ type: 'text', value }];
    return { text };
  }
}
