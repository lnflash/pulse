/**
 * CurrencyParser — parse natural language currency expressions into structured amounts.
 *
 * Handles expressions like:
 *   "five hundred dollars"  → { value: 500, currency: 'JMD' }
 *   "50 USD"                → { value: 50, currency: 'USD' }
 *   "send 1000 sats"        → { value: 1000, currency: 'SAT' }
 *   "$12.50"                → { value: 12.50, currency: 'USD' }
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

/** Number word mappings */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1_000,
  million: 1_000_000,
};

/** Symbol to currency mapping */
const SYMBOL_MAP: Record<string, string> = {
  '$': 'USD',
  'j$': 'JMD',
  'tt$': 'TTD',
  '₿': 'BTC',
  '£': 'GBP',
  '€': 'EUR',
};

/** All currency aliases combined */
const ALL_ALIASES: Record<string, string> = {
  ...jamaicanCurrencyAliases,
  ...trinidadianCurrencyAliases,
};

/**
 * CurrencyParser — heuristic parser for natural language monetary expressions.
 */
export class CurrencyParser {
  /** Default currency to use when none is detected. */
  private readonly defaultCurrency: string;

  constructor(options: { defaultCurrency?: string } = {}) {
    this.defaultCurrency = options.defaultCurrency ?? 'USD';
  }

  /**
   * Parse a text fragment that may contain a monetary amount.
   * @param text Input text (may include surrounding words).
   * @returns Parsed amount, or null if no amount detected.
   */
  parse(text: string): ParsedAmount | null {
    const lower = text.toLowerCase().trim();

    // Try regex-based parsing first (most reliable)
    const regexResult = this.parseByRegex(text, lower);
    if (regexResult) return regexResult;

    // Try word-based number parsing
    const wordResult = this.parseByWords(lower);
    if (wordResult) return wordResult;

    return null;
  }

  private parseByRegex(original: string, lower: string): ParsedAmount | null {
    // Pattern: optional symbol, number, optional currency word
    // E.g.: "$50", "50 USD", "J$1000", "1,500.00 JMD"
    const pattern = /([jJ$tt£€₿]?\$?)\s*([\d,]+(?:\.\d{1,2})?)\s*([a-zA-Z]+)?/;
    const match = pattern.exec(original);
    if (!match) return null;

    const [fullMatch, symbol, numStr, wordAfter] = match;
    const value = parseFloat(numStr!.replace(/,/g, ''));
    if (isNaN(value)) return null;

    let currency = this.defaultCurrency;
    let confidence = 0.7;

    // Resolve currency from symbol
    if (symbol) {
      const resolvedSymbol = SYMBOL_MAP[symbol.toLowerCase()];
      if (resolvedSymbol) {
        currency = resolvedSymbol;
        confidence = 0.95;
      }
    }

    // Resolve currency from word after number
    if (wordAfter) {
      const resolved = ALL_ALIASES[wordAfter.toLowerCase()];
      if (resolved) {
        currency = resolved;
        confidence = 0.9;
      }
    }

    return { value, currency, original: fullMatch!, confidence };
  }

  private parseByWords(lower: string): ParsedAmount | null {
    const words = lower.split(/\s+/);
    let total = 0;
    let current = 0;
    let foundNumber = false;
    let currency = this.defaultCurrency;
    let currencyConfidence = 0.5;

    for (const word of words) {
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

  /**
   * Resolve a currency string to a canonical currency code.
   */
  resolveCurrency(input: string): string | null {
    const lower = input.toLowerCase().trim();
    return ALL_ALIASES[lower] ?? null;
  }
}
