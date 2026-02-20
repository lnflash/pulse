/**
 * DialectClassifier — detect which Caribbean dialect/language a message is written in.
 *
 * Confidence scores accumulate across multiple messages so that repeated Patois
 * expressions progressively increase certainty of the detected dialect.
 */

import {
  jamaicanPatoisDictionary,
  jamaicanPatoisPatterns,
} from './dictionaries/jamaican-patois.js';
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
  | 'standard-english'
  | 'standard-en'
  | 'caribbean-en'
  | 'es'
  | 'fr'
  | 'unknown';

const DIALECT_LABELS: Record<DialectId, string> = {
  'jamaican-patois':    'Jamaican Patois',
  'trinidadian-creole': 'Trinidadian Creole',
  'barbadian-bajan':    'Bajan (Barbadian)',
  'standard-english':   'Standard English',
  'standard-en':        'Standard English',
  'caribbean-en':       'Caribbean English',
  'es':                 'Spanish',
  'fr':                 'French/Haitian Creole',
  'unknown':            'Unknown',
};

/** Accumulated scores per dialect, maintained across classify() calls. */
type AccumulatedScores = Record<string, number>;

/**
 * DialectClassifier — heuristic-based classifier for Caribbean English dialects.
 *
 * Uses dictionary keyword/pattern matching to score how many known Patois or
 * Creole expressions appear in the text. Scores are accumulated across successive
 * `classify()` calls so that confidence grows as more dialect evidence is seen.
 *
 * For high-confidence classification in production, pair this with an LLM prompt.
 */
export class DialectClassifier {
  /** Minimum confidence threshold to declare a dialect match. */
  private readonly minConfidence: number;

  /**
   * Running totals across all classify() calls.
   * Allows confidence to build cumulatively with more messages.
   */
  private accumulated: AccumulatedScores = {
    'jamaican-patois':    0,
    'trinidadian-creole': 0,
    'barbadian-bajan':    0,
    'es':                 0,
    'fr':                 0,
  };

  /** Total number of messages classified so far. */
  private messageCount = 0;

  constructor(options: { minConfidence?: number } = {}) {
    this.minConfidence = options.minConfidence ?? 0.25;
  }

  /**
   * Classify the dialect of a text message.
   *
   * Each call updates internal accumulated scores, so subsequent messages from
   * the same user progressively raise (or lower) dialect confidence.
   *
   * @param text The user's message text.
   * @returns Classification result with dialect and confidence.
   */
  classify(text: string): ClassificationResult {
    const lower = text.toLowerCase().trim();

    // ── Per-message scoring ────────────────────────────────────────────────
    const perMessage: Record<string, number> = {
      'jamaican-patois':    0,
      'trinidadian-creole': 0,
      'barbadian-bajan':    0,
      'es':                 0,
      'fr':                 0,
    };

    // Score Jamaican Patois via dictionary keyword matching
    for (const entry of jamaicanPatoisDictionary) {
      if (lower.includes(entry.patois)) {
        perMessage['jamaican-patois']! += 1;
      }
    }

    // Score Jamaican Patois via regex patterns (heavier weight)
    for (const pattern of jamaicanPatoisPatterns) {
      if (pattern.test(lower)) {
        perMessage['jamaican-patois']! += 2;
      }
    }

    // Score Trinidadian Creole via dictionary keyword matching
    for (const entry of trinidadianCreoleDictionary) {
      if (lower.includes(entry.patois)) {
        perMessage['trinidadian-creole']! += 1;
      }
    }

    // Simple Spanish detection
    const spanishMarkers = ['enviar', 'recibir', 'cuánto', 'saldo', 'dinero', 'pagar', 'gracias'];
    for (const marker of spanishMarkers) {
      if (lower.includes(marker)) perMessage['es']! += 2;
    }

    // Simple French/Haitian Creole detection
    const frenchMarkers = ['votre', 'envoyer', 'solde', 'merci', 'kreyòl'];
    for (const marker of frenchMarkers) {
      if (lower.includes(marker)) perMessage['fr']! += 2;
    }

    // ── Accumulate into running totals ────────────────────────────────────
    this.messageCount++;
    for (const dialect of Object.keys(perMessage)) {
      this.accumulated[dialect] = (this.accumulated[dialect] ?? 0) + (perMessage[dialect] ?? 0);
    }

    // ── Compute confidence from accumulated scores ─────────────────────────
    const totalAccumulated = Object.values(this.accumulated).reduce((a, b) => a + b, 0);

    if (totalAccumulated === 0) {
      return this._standardEnglish();
    }

    // Find the dialect with the highest accumulated score
    const sorted = (Object.entries(this.accumulated) as [string, number][])
      .sort(([, a], [, b]) => b - a);

    const [topDialect, topScore] = sorted[0]!;

    // Confidence: proportion of evidence pointing to this dialect,
    // boosted slightly by message count (more data → higher ceiling).
    const rawConfidence = topScore / Math.max(totalAccumulated, 1);
    const messageFactor = Math.min(this.messageCount / 3, 1.0); // ramp up over 3 msgs
    const confidence = Math.min(rawConfidence * (0.7 + 0.3 * messageFactor), 1.0);

    if (confidence < this.minConfidence || topScore === 0) {
      // Check if per-message had any signal at all — might be caribbean-en
      const perMessageTotal = Object.values(perMessage).reduce((a, b) => a + b, 0);
      if (perMessageTotal > 0) {
        return {
          dialect: 'caribbean-en',
          confidence: 0.35,
          label: DIALECT_LABELS['caribbean-en'],
          language: 'en',
        };
      }
      return this._standardEnglish();
    }

    const dialectId = topDialect as DialectId;
    const label = DIALECT_LABELS[dialectId] ?? topDialect;
    const language = dialectId === 'es' ? 'es' : dialectId === 'fr' ? 'fr' : 'en';

    return { dialect: dialectId, confidence, label, language };
  }

  /**
   * Reset accumulated scores (e.g. for a new conversation / user session).
   */
  reset(): void {
    for (const key of Object.keys(this.accumulated)) {
      this.accumulated[key] = 0;
    }
    this.messageCount = 0;
  }

  /**
   * Get the current accumulated dialect scores (useful for debugging).
   */
  getAccumulatedScores(): Readonly<AccumulatedScores> {
    return { ...this.accumulated };
  }

  private _standardEnglish(): ClassificationResult {
    return {
      dialect: 'standard-english',
      confidence: 0.5,
      label: DIALECT_LABELS['standard-english'],
      language: 'en',
    };
  }
}
