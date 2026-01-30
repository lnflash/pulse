import { IntentResult } from '../types';

export interface IntentClassifierPort {
  classify(text: string, context?: unknown): Promise<IntentResult>;
}
