import { Injectable } from '@nestjs/common';
import { IntentClassifierPort } from '../../../core/ports/intent-classifier.port';
import { IntentResult, Intent } from '../../../core/types';

@Injectable()
export class IntentPipelineService implements IntentClassifierPort {
  async classify(text: string, context?: unknown): Promise<IntentResult> {
    const normalized = text.toLowerCase().trim();

    if (normalized.includes('balance') || normalized.includes('check my')) {
      return {
        kind: 'core',
        intent: Intent.CheckBalance,
        slots: {},
        confidence: 1.0,
        rawText: text,
      };
    }

    if (normalized.includes('help')) {
      return {
        kind: 'core',
        intent: Intent.Help,
        slots: {},
        confidence: 1.0,
        rawText: text,
      };
    }

    if (normalized.includes('link')) {
      return {
        kind: 'core',
        intent: Intent.LinkAccount,
        slots: {},
        confidence: 1.0,
        rawText: text,
      };
    }

    if (normalized.includes('send')) {
      return {
        kind: 'core',
        intent: Intent.SendPayment,
        slots: {},
        confidence: 0.8,
        rawText: text,
      };
    }

    return {
      kind: 'core',
      intent: Intent.Conversational,
      slots: {},
      confidence: 0.5,
      rawText: text,
    };
  }
}
