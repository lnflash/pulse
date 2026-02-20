/**
 * CurrencyParser — parse natural language currency expressions into structured amounts.
 *
 * Handles expressions like:
 *   "five hundred dollars"  → { value: 500,  currency: 'JMD' }
 *   "50 USD"                → { value: 50,   currency: 'USD' }
 *   "send 1000 sats"        → { value: 1000, currency: 'SAT' }
 *   "$12.50"                → { value: 12.50, currency: 'USD' }
 *   "two bills"             → { value: 200,  currency: 'JMD' }
 *   "a grand"               → { value: 1000, currency: 'JMD' }
 *   "tree grand"            → { value: 3000, currency: 'JMD' }
 */

import { jamaicanCurrencyAliases } from './dictionaries/jamaican-patois.js';
import { trinidadianCurrencyAliases } from './dictionaries/trinidadian-creole.js';

/** A parsed monetary amount. */
export interface ParsedAmount {
  /** Numeric value (always positive) */
  value: number;
  /** Resolved currency code, e.g. 'USD', 'JMD', 'SAT' */
  currency: string;
  /** The original string that was parsed */
  original: string;
  /** Confidence of the parse (0.0–1.0) */
  confidence: number;
}

/** Number word mappings (English + some Patois variants). */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1_000,
  million: 1_000_000,
  // Patois/Creole number variants
  tree: 3,   // "tree" = three in Patois
  fibe: 5,
  nain: 9,
};

/** Multiplier words that follow a number (e.g. "bills" = ×100). */
const CARIBBEAN_MULTIPLIERS: Record<string, { factor: number; currency: string }> = {
  'bills':  { factor: 100,  currency: 'JMD' },
  'bill':   { factor: 100,  currency: 'JMD' },
  'grand':  { factor: 1000, currency: 'JMD' },
  'g':      { factor: 1000, currency: 'JMD' },
};

/**
 * Article words that can precede a number/multiplier.
 * "a grand" → 1 grand → 1000
 */
const ARTICLES = new Set(['a', 'an', 'di', 'de', 'the']);

/** Symbol to currency mapping. */
const SYMBOL_MAP: Record<string, string> = {
  '$':  'USD',
  'j$': 'JMD',
  'tt$':'TTD',
  '₿':  'BTC',
  '£':  'GBP',
  '€':  'EUR',
};

/** All currency aliases combined. */
const ALL_ALIASES: Record<string, string> = {
  ...jamaicanCurrencyAliases,
  ...trinidadianCurrencyAliases,
  // Additional explicit mappings
  'bbd': 'BBD',
  'bds': 'BBD',
  'bajan dollar':     'BBD',
  'bajan dollars':    'BBD',
  'barbadian dollar': 'BBD',
};

/**
 * CurrencyParser — heuristic parser for natural language monetary expressions.
 *
 * Covers standard numeric formats, English number words, and Caribbean idioms
 * like "two bills" (200 JMD) and "a grand" (1000 JMD).
 */
export class CurrencyParser {
  /** Default currency to use when none is detected. */
  private readonly defaultCurrency: string;

  constructor(options: { defaultCurrency?: string } = {}) {
    this.defaultCurrency = options.defaultCurrency ?? 'USD';
  }

  /**
   * Parse a text fragment that may contain a monetary amount.
   *
   * @param text Input text (may include surrounding words).
   * @returns Parsed amount, or null if no amount detected.
   */
  parse(text: string): ParsedAmount | null {
    const lower = text.toLowerCase().trim();

    // 1. Try Caribbean idiom parsing (bills, grand, etc.)
    const caribbeanResult = this.parseCaribbean(lower, text);
    if (caribbeanResult) return caribbeanResult;

    // 2. Try regex-based parsing (numeric formats + currency codes/symbols)
    const regexResult = this.parseByRegex(text, lower);
    if (regexResult) return regexResult;

    // 3. Try pure word-based number parsing
    const wordResult = this.parseByWords(lower);
    if (wordResult) return wordResult;

    return null;
  }

  /**
   * Parse in a dialect context. Uses JMD as the default currency when the
   * dialect is Jamaican Patois (or any Caribbean dialect) and no explicit
   * currency is mentioned.
   *
   * @param text           Input text.
   * @param dialectContext Detected dialect ID, e.g. 'jamaican-patois'.
   */
  parseInContext(text: string, dialectContext: string): ParsedAmount | null {
    const isCaribbean = /jamaican|trinidadian|barbadian|caribbean/.test(dialectContext);
    const contextDefault = isCaribbean ? 'JMD' : this.defaultCurrency;

    const lower = text.toLowerCase().trim();

    const caribbeanResult = this.parseCaribbean(lower, text, contextDefault);
    if (caribbeanResult) return caribbeanResult;

    const regexResult = this.parseByRegex(text, lower, contextDefault);
    if (regexResult) return regexResult;

    const wordResult = this.parseByWords(lower, contextDefault);
    if (wordResult) return wordResult;

    return null;
  }

  /**
   * Resolve a currency string to a canonical currency code.
   */
  resolveCurrency(input: string): string | null {
    const lower = input.toLowerCase().trim();
    return ALL_ALIASES[lower] ?? null;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Parse Caribbean idioms: "two bills", "a grand", "tree grand", etc.
   */
  private parseCaribbean(
    lower: string,
    original: string,
    defaultCurrency?: string,
  ): ParsedAmount | null {
    const words = lower.split(/\s+/);

    // Scan for: [article|number_word] <multiplier>
    for (let i = 0; i < words.length; i++) {
      const word = words[i]!;
      const multiplierInfo = CARIBBEAN_MULTIPLIERS[word];
      if (!multiplierInfo) continue;

      // Look for a number or article directly before the multiplier
      const prev = i > 0 ? words[i - 1] : undefined;
      let quantity: number | null = null;

      if (prev !== undefined) {
        if (ARTICLES.has(prev)) {
          quantity = 1; // "a grand" → 1000
        } else if (NUMBER_WORDS[prev] !== undefined) {
          quantity = NUMBER_WORDS[prev]!;
        } else {
          // Try parsing as a bare number
          const n = parseFloat(prev.replace(/,/g, ''));
          if (!isNaN(n)) quantity = n;
        }
      }

      if (quantity !== null && quantity > 0) {
        const value = quantity * multiplierInfo.factor;
        // Check if an explicit currency comes after the multiplier
        const next = words[i + 1];
        const explicitCurrency = next ? ALL_ALIASES[next] : undefined;
        const currency = explicitCurrency ?? multiplierInfo.currency;

        return {
          value,
          currency,
          original,
          confidence: 0.88,
        };
      }
    }

    return null;
  }

  private parseByRegex(
    original: string,
    lower: string,
    defaultCurrency?: string,
  ): ParsedAmount | null {
    // Pattern: optional symbol prefix, number (with optional commas/decimals), optional currency word
    const pattern = /([jJ]?\$|[tT][tT]\$|₿|£|€)?\s*([\d,]+(?:\.\d{1,2})?)\s*([a-zA-Z]+)?/;
    const match = pattern.exec(original);
    if (!match) return null;

    const [fullMatch, symbol, numStr, wordAfter] = match;
    const value = parseFloat((numStr ?? '').replace(/,/g, ''));
    if (isNaN(value)) return null;

    let currency = defaultCurrency ?? this.defaultCurrency;
    let confidence = 0.7;

    // Resolve currency from symbol
    if (symbol) {
      const resolvedSymbol = SYMBOL_MAP[symbol.toLowerCase()];
      if (resolvedSymbol) {
        currency = resolvedSymbol;
        confidence = 0.95;
      }
    }

    // Resolve currency from word after number (e.g. "50 USD", "1000 sats")
    if (wordAfter) {
      const resolved = ALL_ALIASES[wordAfter.toLowerCase()];
      if (resolved) {
        currency = resolved;
        confidence = 0.9;
      }
    }

    return { value, currency, original: fullMatch ?? original, confidence };
  }

  private parseByWords(
    lower: string,
    defaultCurrency?: string,
  ): ParsedAmount | null {
    const words = lower.split(/\s+/);
    let total = 0;
    let current = 0;
    let foundNumber = false;
    let currency = defaultCurrency ?? this.defaultCurrency;
    let currencyConfidence = 0.5;

    for (const word of words) {
      // Skip articles
      if (ARTICLES.has(word)) continue;

      const num = NUMBER_WORDS[word];
      if (num !== undefined) {
        foundNumber = true;
        if (num === 100) {
          current = current === 0 ? 100 : current * 100;
        } else if (num >= 1000) {
          total += (current === 0 ? 1 : current) * num;
          current = 0;
        } else {
          current += num;
        }
      } else {
        // Check for currency word
        const resolved = ALL_ALIASES[word];
        if (resolved) {
          currency = resolved;
          currencyConfidence = 0.85;
        }
      }
    }

    if (!foundNumber) return null;

    const value = total + current;
    return {
      value,
      currency,
      original: lower,
      confidence: currencyConfidence,
    };
  }
}
