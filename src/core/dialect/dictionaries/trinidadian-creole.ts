/**
 * Trinidadian Creole dialect dictionary.
 */

import type { DialectEntry } from './jamaican-patois.js';

export const trinidadianCreoleDictionary: DialectEntry[] = [
  // Greetings
  { patois: 'wha happenin', standard: 'what is happening', category: 'greeting' },
  { patois: 'how yuh going', standard: 'how are you doing', category: 'greeting' },
  { patois: 'allyuh', standard: 'all of you / everyone', category: 'greeting' },

  // Affirmations
  { patois: 'aight', standard: 'alright / yes', category: 'affirmation' },
  { patois: 'yes boss', standard: 'yes / confirmed', category: 'affirmation' },
  { patois: 'oui', standard: 'yes', category: 'affirmation' },

  // Actions
  { patois: 'lend meh', standard: 'send me / lend me', category: 'action' },
  { patois: 'send meh', standard: 'send me', category: 'action' },
  { patois: 'gimme', standard: 'give me', category: 'action' },

  // Negations
  { patois: 'doh', standard: 'do not', category: 'negation' },
  { patois: "cyah", standard: 'cannot', category: 'negation' },
  { patois: 'nah', standard: 'no', category: 'negation' },

  // Amounts
  { patois: 'lil bit', standard: 'a little', category: 'amount' },
  { patois: 'lil', standard: 'little', category: 'amount' },

  // Misc
  { patois: 'pardner', standard: 'friend / partner', category: 'misc' },
  { patois: 'tabanca', standard: 'heartbreak / loss', category: 'misc' },
];

export const trinidadianCurrencyAliases: Record<string, string> = {
  'ttd': 'TTD',
  'tts': 'TTD',
  'tt dollar': 'TTD',
  'trinidadian dollar': 'TTD',
  'usd': 'USD',
  'us': 'USD',
  'sat': 'SAT',
  'sats': 'SAT',
  'bitcoin': 'BTC',
};
