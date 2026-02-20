/**
 * DialectClassifier — detect which Caribbean dialect/language a message is written in.
 */

import { jamaicanPatoisDictionary } from './dictionaries/jamaican-patois.js';
import { trinidadianCreoleDictionary } from './dictionaries/trinidadian-creole.js';

/** Result of dialect classification. */
export interface ClassificationResult {
  /** Detected dialect identifier */
  dialect: string;
  /** Confidence score (0.0–1.0) */
  confidence: number;
  /** Human-readable label */
  label: string;
  /** ISO language code */
  language: string;
}

/** Supported dialect identifiers. */
export type DialectId =
  | 'jamaican-patois'
  | 'trinidadian-creole'
  | 'barbadian-bajan'
  | 'standard-en'
  | 'caribbean-en'
  | 'es'
  | 'fr'
  | 'unknown';

const DIALECT_LABELS: Record<DialectId, string> = {
  'jamaican-patois': 'Jamaican Patois',
  'trinidadian-creole': 'Trinidadian Creole',
  'barbadian-bajan': 'Bajan (Barbadian)',
  'standard-en': 'Standard English',
  'caribbean-en': 'Caribbean English',
  'es': 'Spanish',
  'fr': 'French/Haitian Creole',
  'unknown': 'Unknown',
};

/**
 * DialectClassifier — heuristic-based classifier for Caribbean English dialects.
 *
 * Uses dictionary matching to score how many known Patois/Creole expressions
 * appear in the text. This is a fast heuristic; for high-confidence classification,
 * use an LLM prompt in the AI pipeline.
 */
export class DialectClassifier {
  /** Minimum confidence threshold to declare a dialect match. */
  private readonly minConfidence: number;

  constructor(options: { minConfidence?: number } = {}) {
    this.minConfidence = options.minConfidence ?? 0.3;
  }

  /**
   * Classify the dialect of a text message.
   * @param text The user's message text.
   * @returns Classification result with dialect and confidence.
   */
  classify(text: string): ClassificationResult {
    const normalized = text.toLowerCase().trim();

    const scores: Record<DialectId, number> = {
      'jamaican-patois': 0,
      'trinidadian-creole': 0,
      'barbadian-bajan': 0,
      'standard-en': 0,
      'caribbean-en': 0,
      'es': 0,
      'fr': 0,
      'unknown': 0,
    };

    // Score Jamaican Patois
    for (const entry of jamaicanPatoisDictionary) {
      if (normalized.includes(entry.patois)) {
        scores['jamaican-patois'] += 1;
      }
    }

    // Score Trinidadian Creole
    for (const entry of trinidadianCreoleDictionary) {
      if (normalized.includes(entry.patois)) {
        scores['trinidadian-creole'] += 1;
      }
    }

    // Simple Spanish detection
    const spanishMarkers = ['enviar', 'recibir', 'cuánto', 'saldo', 'dinero', 'pagar', 'gracias'];
    for (const marker of spanishMarkers) {
      if (normalized.includes(marker)) scores['es'] += 1;
    }

    // Find the highest-scoring dialect
    const totalMatches = Object.values(scores).reduce((a, b) => a + b, 0);

    if (totalMatches === 0) {
      return {
        dialect: 'standard-en',
        confidence: 0.5,
        label: DIALECT_LABELS['standard-en'],
        language: 'en',
      };
    }

    const topDialect = (Object.entries(scores) as [DialectId, number][])
      .sort(([, a], [, b]) => b - a)[0]!;

    const confidence = Math.min(topDialect[1] / Math.max(totalMatches, 3), 1.0);

    if (confidence < this.minConfidence) {
      return {
        dialect: 'caribbean-en',
        confidence: 0.4,
        label: DIALECT_LABELS['caribbean-en'],
        language: 'en',
      };
    }

    const dialectId = topDialect[0];
    return {
      dialect: dialectId,
      confidence,
      label: DIALECT_LABELS[dialectId],
      language: dialectId === 'es' ? 'es' : dialectId === 'fr' ? 'fr' : 'en',
    };
  }
}
