/**
 * DialectNormalizer — normalize Patois/Creole text to standard English before AI processing.
 *
 * Strategy:
 *  1. Sort substitution entries by pattern length (longest first) so multi-word
 *     phrases are replaced before their component words are touched.
 *  2. Apply each pattern as a whole-word regex, case-insensitively.
 *  3. Return both the normalized and original text.
 */

import { jamaicanPatoisDictionary } from './dictionaries/jamaican-patois.js';
import { trinidadianCreoleDictionary } from './dictionaries/trinidadian-creole.js';

/** Result of text normalization. */
export interface NormalizationResult {
  /** Normalized text (Patois → English substitutions applied) */
  normalized: string;
  /** Original, unmodified text */
  original: string;
  /** Number of distinct substitution patterns that matched */
  substitutions: number;
  /** Whether any normalization was applied */
  wasNormalized: boolean;
}

/** Internal substitution entry. */
interface SubstitutionEntry {
  pattern: string;
  replacement: string;
}

/**
 * DialectNormalizer — applies dictionary substitutions to normalize Patois to English.
 *
 * This pass is applied BEFORE sending text to the AI model. The AI's system prompt
 * also handles remaining dialect expressions for a two-layer safety net.
 */
export class DialectNormalizer {
  /**
   * Normalize a Jamaican Patois message to standard English.
   *
   * Examples:
   *   "mi waa fi sen yuh money" → "I want to send you money"
   *   "nah, cyaan do dat ting"  → "no / will not, cannot do that thing"
   *   "two bills"               → "200"
   */
  normalizeJamaicanPatois(text: string): NormalizationResult {
    return this.applyDictionary(text, this.buildEntries(jamaicanPatoisDictionary.map((e) => ({
      pattern: e.patois,
      replacement: e.standard,
    }))));
  }

  /**
   * Normalize a Trinidadian Creole message to standard English.
   */
  normalizeTrinidadianCreole(text: string): NormalizationResult {
    return this.applyDictionary(text, this.buildEntries(trinidadianCreoleDictionary.map((e) => ({
      pattern: e.patois,
      replacement: e.standard,
    }))));
  }

  /**
   * Normalize based on a detected dialect identifier.
   * Falls through to the original text if no normalizer exists for the dialect.
   *
   * @param text    The raw user message.
   * @param dialect Dialect identifier, e.g. 'jamaican-patois'.
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

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Sort entries so longer (multi-word) patterns are applied first.
   * This prevents "mi" from matching inside "mi waa fi" before the phrase does.
   */
  private buildEntries(raw: SubstitutionEntry[]): SubstitutionEntry[] {
    return [...raw].sort((a, b) => b.pattern.length - a.pattern.length);
  }

  private applyDictionary(
    text: string,
    entries: SubstitutionEntry[],
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
