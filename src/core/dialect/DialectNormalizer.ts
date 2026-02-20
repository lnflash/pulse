/**
 * DialectNormalizer — normalize Patois/Creole text to standard English before AI processing.
 */

import { jamaicanPatoisDictionary } from './dictionaries/jamaican-patois.js';
import { trinidadianCreoleDictionary } from './dictionaries/trinidadian-creole.js';

/** Result of text normalization. */
export interface NormalizationResult {
  /** Normalized text */
  normalized: string;
  /** Original text */
  original: string;
  /** Number of substitutions made */
  substitutions: number;
  /** Whether any normalization was applied */
  wasNormalized: boolean;
}

/**
 * DialectNormalizer — applies dictionary substitutions to normalize Patois to English.
 *
 * This is a simple pass that's applied BEFORE sending to the AI model.
 * The AI model itself also handles dialect understanding via system prompt.
 */
export class DialectNormalizer {
  /**
   * Normalize a Jamaican Patois message to standard English.
   */
  normalizeJamaicanPatois(text: string): NormalizationResult {
    return this.applyDictionary(text, jamaicanPatoisDictionary.map((e) => ({
      pattern: e.patois,
      replacement: e.standard,
    })));
  }

  /**
   * Normalize a Trinidadian Creole message to standard English.
   */
  normalizeTrinidadianCreole(text: string): NormalizationResult {
    return this.applyDictionary(text, trinidadianCreoleDictionary.map((e) => ({
      pattern: e.patois,
      replacement: e.standard,
    })));
  }

  /**
   * Normalize based on a detected dialect.
   * Falls through to returning the original text if no normalizer exists for the dialect.
   */
  normalize(text: string, dialect: string): NormalizationResult {
    switch (dialect) {
      case 'jamaican-patois':
        return this.normalizeJamaicanPatois(text);
      case 'trinidadian-creole':
        return this.normalizeTrinidadianCreole(text);
      default:
        return { normalized: text, original: text, substitutions: 0, wasNormalized: false };
    }
  }

  private applyDictionary(
    text: string,
    entries: Array<{ pattern: string; replacement: string }>,
  ): NormalizationResult {
    let normalized = text.toLowerCase();
    let substitutions = 0;

    for (const { pattern, replacement } of entries) {
      const regex = new RegExp(`\\b${this.escapeRegex(pattern)}\\b`, 'gi');
      const before = normalized;
      normalized = normalized.replace(regex, replacement);
      if (normalized !== before) substitutions++;
    }

    return {
      normalized,
      original: text,
      substitutions,
      wasNormalized: substitutions > 0,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
