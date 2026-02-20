/**
 * Jamaican Patois dialect dictionary.
 *
 * Maps colloquial Patois expressions to their standard English equivalents
 * for normalization before processing.
 */

export interface DialectEntry {
  /** The Patois expression (lowercase, normalized) */
  patois: string;
  /** Standard English equivalent */
  standard: string;
  /** Category for analytics */
  category: 'greeting' | 'amount' | 'action' | 'affirmation' | 'negation' | 'question' | 'misc';
}

/** Jamaican Patois expressions used in financial/payment contexts. */
export const jamaicanPatoisDictionary: DialectEntry[] = [
  // Greetings
  { patois: 'wah gwaan', standard: 'what is happening', category: 'greeting' },
  { patois: 'wagwan', standard: 'what is happening', category: 'greeting' },
  { patois: 'irie', standard: 'good / fine', category: 'greeting' },
  { patois: 'respect', standard: 'thank you / acknowledged', category: 'greeting' },
  { patois: 'blessed', standard: 'thank you / doing well', category: 'greeting' },
  { patois: 'big up', standard: 'greetings / respect to', category: 'greeting' },

  // Affirmations
  { patois: 'ya man', standard: 'yes', category: 'affirmation' },
  { patois: 'aye', standard: 'yes', category: 'affirmation' },
  { patois: 'alright', standard: 'yes / okay', category: 'affirmation' },
  { patois: 'zeen', standard: 'I understand / agreed', category: 'affirmation' },

  // Negations
  { patois: 'nuh', standard: 'no / not', category: 'negation' },
  { patois: 'nah', standard: 'no / will not', category: 'negation' },
  { patois: "cyaan", standard: 'cannot', category: 'negation' },

  // Financial terms
  { patois: 'money', standard: 'money', category: 'amount' },
  { patois: 'likkle', standard: 'little', category: 'amount' },
  { patois: 'nuff', standard: 'enough / a lot', category: 'amount' },
  { patois: 'dutty', standard: 'dirty', category: 'misc' },
  { patois: 'bredren', standard: 'friend / brother', category: 'misc' },
  { patois: 'sista', standard: 'friend / sister', category: 'misc' },

  // Actions
  { patois: 'sen', standard: 'send', category: 'action' },
  { patois: 'gimme', standard: 'give me', category: 'action' },
  { patois: 'get mi', standard: 'get me / receive', category: 'action' },
  { patois: 'link mi', standard: 'contact me / send me', category: 'action' },

  // Questions
  { patois: 'how much', standard: 'how much', category: 'question' },
  { patois: 'wha di balance', standard: 'what is the balance', category: 'question' },
  { patois: 'mi have', standard: 'I have', category: 'question' },
  { patois: 'mi want', standard: 'I want', category: 'action' },
];

/** Currency expressions specific to Jamaica */
export const jamaicanCurrencyAliases: Record<string, string> = {
  'jmd': 'JMD',
  'dollar': 'JMD',
  'dollars': 'JMD',
  'jamaican dollar': 'JMD',
  'jamaican dollars': 'JMD',
  'j$': 'JMD',
  'usd': 'USD',
  'us': 'USD',
  'us dollar': 'USD',
  'us dollars': 'USD',
  'american dollar': 'USD',
  'sat': 'SAT',
  'sats': 'SAT',
  'satoshi': 'SAT',
  'satoshis': 'SAT',
  'bitcoin': 'BTC',
  'btc': 'BTC',
};
