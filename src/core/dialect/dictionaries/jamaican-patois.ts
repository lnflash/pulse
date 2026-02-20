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

/**
 * Jamaican Patois expressions — ordered longest-first so multi-word phrases
 * are replaced before single-word sub-phrases overlap them.
 */
export const jamaicanPatoisDictionary: DialectEntry[] = [
  // ── Multi-word greetings (must come before single-word entries) ──────────
  { patois: 'wah gwaan', standard: 'what is happening', category: 'greeting' },
  { patois: 'wagwan',    standard: 'what is happening', category: 'greeting' },
  { patois: 'yow',       standard: 'hey',               category: 'greeting' },
  { patois: 'irie',      standard: 'good / fine',       category: 'greeting' },
  { patois: 'respect',   standard: 'thank you / acknowledged', category: 'greeting' },
  { patois: 'blessed',   standard: 'thank you / doing well',   category: 'greeting' },
  { patois: 'big up',    standard: 'greetings / respect to',   category: 'greeting' },

  // ── Multi-word affirmations ──────────────────────────────────────────────
  { patois: 'yeh man',  standard: 'yes',                 category: 'affirmation' },
  { patois: 'yeah man', standard: 'yes',                 category: 'affirmation' },
  { patois: 'ya man',   standard: 'yes',                 category: 'affirmation' },
  { patois: 'seen',     standard: 'understood / agreed', category: 'affirmation' },
  { patois: 'aye',      standard: 'yes',                 category: 'affirmation' },
  { patois: 'zeen',     standard: 'I understand / agreed', category: 'affirmation' },
  { patois: 'alright',  standard: 'yes / okay',          category: 'affirmation' },

  // ── People / social ─────────────────────────────────────────────────────
  { patois: 'bredda',   standard: 'brother / friend',    category: 'misc' },
  { patois: 'bredren',  standard: 'friend / brother',    category: 'misc' },
  { patois: 'sistren',  standard: 'sister / friend',     category: 'misc' },
  { patois: 'sista',    standard: 'friend / sister',     category: 'misc' },
  { patois: 'dutty',    standard: 'dirty',               category: 'misc' },

  // ── Multi-word questions / phrases ───────────────────────────────────────
  { patois: 'wha di balance', standard: 'what is the balance', category: 'question' },
  { patois: 'how much',       standard: 'how much',             category: 'question' },
  { patois: 'mi waa fi',      standard: 'I want to',            category: 'action' },
  { patois: 'mi want fi',     standard: 'I want to',            category: 'action' },
  { patois: 'mi want',        standard: 'I want',               category: 'action' },
  { patois: 'get mi',         standard: 'get me / receive',     category: 'action' },
  { patois: 'link mi',        standard: 'contact me / send me', category: 'action' },
  { patois: 'mi have',        standard: 'I have',               category: 'question' },

  // ── Financial multi-word ─────────────────────────────────────────────────
  { patois: 'two bills',   standard: '200',            category: 'amount' },
  { patois: 'tree bills',  standard: '300',            category: 'amount' },
  { patois: 'four bills',  standard: '400',            category: 'amount' },
  { patois: 'five bills',  standard: '500',            category: 'amount' },
  { patois: 'ten bills',   standard: '1000',           category: 'amount' },
  { patois: 'half a grand', standard: '500',           category: 'amount' },
  { patois: 'a grand',     standard: '1000',           category: 'amount' },
  { patois: 'two grand',   standard: '2000',           category: 'amount' },
  { patois: 'tree grand',  standard: '3000',           category: 'amount' },
  { patois: 'five grand',  standard: '5000',           category: 'amount' },

  // ── Single-word pronouns / common words ──────────────────────────────────
  { patois: 'mi',   standard: 'I / me',    category: 'misc' },
  { patois: 'yuh',  standard: 'you',       category: 'misc' },
  { patois: 'dem',  standard: 'them',      category: 'misc' },
  { patois: 'weh',  standard: 'where',     category: 'misc' },
  { patois: 'seh',  standard: 'say',       category: 'misc' },
  { patois: 'mek',  standard: 'make / let', category: 'misc' },
  { patois: 'ting', standard: 'thing',     category: 'misc' },
  { patois: 'deh',  standard: 'there / here', category: 'misc' },
  { patois: 'fi',   standard: 'for / to',  category: 'misc' },
  { patois: 'waa',  standard: 'want',      category: 'misc' },

  // ── Negations ────────────────────────────────────────────────────────────
  { patois: 'cyaa',  standard: 'cannot', category: 'negation' },
  { patois: 'cyaan', standard: 'cannot', category: 'negation' },
  { patois: 'nuh',   standard: 'no / not', category: 'negation' },
  { patois: 'nah',   standard: 'no / will not', category: 'negation' },

  // ── Single-word actions ──────────────────────────────────────────────────
  { patois: 'sen',   standard: 'send',    category: 'action' },
  { patois: 'gimme', standard: 'give me', category: 'action' },

  // ── Financial amounts ─────────────────────────────────────────────────────
  { patois: 'money',  standard: 'money',          category: 'amount' },
  { patois: 'likkle', standard: 'little',          category: 'amount' },
  { patois: 'nuff',   standard: 'enough / a lot',  category: 'amount' },
  { patois: 'smalls', standard: 'a small amount',  category: 'amount' },
  { patois: 'change', standard: 'change / coins',  category: 'amount' },
  { patois: 'bills',  standard: 'dollars',         category: 'amount' },
  { patois: 'grand',  standard: '1000',            category: 'amount' },
];

/** Currency expressions specific to Jamaica. */
export const jamaicanCurrencyAliases: Record<string, string> = {
  // Jamaican dollar
  'jmd':              'JMD',
  'dollar':           'JMD',
  'dollars':          'JMD',
  'jamaican dollar':  'JMD',
  'jamaican dollars': 'JMD',
  'j$':               'JMD',
  'bills':            'JMD',   // "two bills" → 200 JMD
  'grand':            'JMD',   // "a grand"   → 1000 JMD

  // US dollar
  'usd':              'USD',
  'us':               'USD',
  'us dollar':        'USD',
  'us dollars':       'USD',
  'american dollar':  'USD',

  // Trinidad & Tobago
  'ttd':              'TTD',

  // Barbados
  'bbd':              'BBD',
  'bds':              'BBD',
  'bajan dollar':     'BBD',

  // Crypto
  'sat':              'SAT',
  'sats':             'SAT',
  'satoshi':          'SAT',
  'satoshis':         'SAT',
  'bitcoin':          'BTC',
  'btc':              'BTC',
};

/**
 * Regex patterns that strongly indicate Jamaican Patois.
 * Used for fast heuristic detection by the DialectClassifier.
 */
export const jamaicanPatoisPatterns: RegExp[] = [
  /\bwah\s+gwaan\b/i,
  /\bwagwan\b/i,
  /\byuh\b/i,
  /\bmi\s+(waa|want|have|seh)\b/i,
  /\bnuh\b/i,
  /\bcyaa[n]?\b/i,
  /\bbredda\b/i,
  /\bsistren\b/i,
  /\byow\b/i,
  /\biree?\b/i,
  /\bseh\b/i,
  /\bdeh\b/i,
  /\bweh\b/i,
  /\bnah\b/i,
  /\bmek\b/i,
  /\bting\b/i,
  /\bwaa\b/i,
  /\bfi\b/i,
  /\bsen\b/i,
  /\bsmalls\b/i,
  /\b(two|tree|four|five|ten)\s+bills\b/i,
  /\ba\s+grand\b/i,
  /\bseen\b/i,
  /\birie\b/i,
  /\byeh\s+man\b/i,
];
