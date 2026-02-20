/**
 * CurrencyParser unit tests.
 *
 * Tests Caribbean idiom parsing, numeric formats, currency symbols,
 * number words, and dialect context parsing.
 */

import { CurrencyParser } from '../../../src/core/dialect/CurrencyParser';

describe('CurrencyParser', () => {
  let parser: CurrencyParser;

  beforeEach(() => {
    parser = new CurrencyParser({ defaultCurrency: 'USD' });
  });

  // ── Caribbean idioms ─────────────────────────────────────────────────────

  describe('Caribbean idioms', () => {
    it('"two bills" → { amount: 200, currency: "JMD" }', () => {
      const result = parser.parse('two bills');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(200);
      expect(result!.currency).toBe('JMD');
    });

    it('"a grand" → { amount: 1000, currency: "JMD" }', () => {
      const result = parser.parse('a grand');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1000);
      expect(result!.currency).toBe('JMD');
    });

    it('"three grand" → { amount: 3000, currency: "JMD" }', () => {
      const result = parser.parse('three grand');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(3000);
      expect(result!.currency).toBe('JMD');
    });

    it('"tree grand" (Patois) → { amount: 3000, currency: "JMD" }', () => {
      const result = parser.parse('tree grand');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(3000);
      expect(result!.currency).toBe('JMD');
    });

    it('"five bills" → { amount: 500, currency: "JMD" }', () => {
      const result = parser.parse('five bills');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(500);
      expect(result!.currency).toBe('JMD');
    });

    it('"ten bills" → { amount: 1000, currency: "JMD" }', () => {
      const result = parser.parse('ten bills');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1000);
      expect(result!.currency).toBe('JMD');
    });

    it('"1 bill" → { amount: 100, currency: "JMD" }', () => {
      const result = parser.parse('1 bill');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(100);
      expect(result!.currency).toBe('JMD');
    });

    it('"2 grand" → { amount: 2000, currency: "JMD" }', () => {
      const result = parser.parse('2 grand');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(2000);
      expect(result!.currency).toBe('JMD');
    });

    it('has high confidence for Caribbean idioms', () => {
      const result = parser.parse('two bills');
      expect(result!.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('includes the original text in the result', () => {
      const result = parser.parse('a grand');
      expect(result!.original).toBeTruthy();
    });
  });

  // ── Currency symbol parsing ──────────────────────────────────────────────

  describe('currency symbol parsing', () => {
    it('"$50" → { amount: 50, currency: "USD" }', () => {
      const result = parser.parse('$50');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(50);
      expect(result!.currency).toBe('USD');
    });

    it('"$100.00" → { amount: 100, currency: "USD" }', () => {
      const result = parser.parse('$100.00');
      expect(result).not.toBeNull();
      expect(result!.value).toBeCloseTo(100);
      expect(result!.currency).toBe('USD');
    });

    it('"$12.50" → { amount: 12.5, currency: "USD" }', () => {
      const result = parser.parse('$12.50');
      expect(result).not.toBeNull();
      expect(result!.value).toBeCloseTo(12.5);
      expect(result!.currency).toBe('USD');
    });

    it('"J$500" → { currency: "JMD" }', () => {
      const result = parser.parse('J$500');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(500);
      expect(result!.currency).toBe('JMD');
    });
  });

  // ── Currency code parsing ────────────────────────────────────────────────

  describe('currency code parsing', () => {
    it('"50 USD" → { amount: 50, currency: "USD" }', () => {
      const result = parser.parse('50 USD');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(50);
      expect(result!.currency).toBe('USD');
    });

    it('"5000 sats" → { amount: 5000, currency: "SAT" }', () => {
      const result = parser.parse('5000 sats');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(5000);
      expect(result!.currency).toBe('SAT');
    });

    it('"1000 satoshis" → { amount: 1000, currency: "SAT" }', () => {
      const result = parser.parse('1000 satoshis');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1000);
      expect(result!.currency).toBe('SAT');
    });

    it('"500 JMD" → { amount: 500, currency: "JMD" }', () => {
      const result = parser.parse('500 JMD');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(500);
      expect(result!.currency).toBe('JMD');
    });

    it('"1,500 JMD" → { amount: 1500, currency: "JMD" } (handles commas)', () => {
      const result = parser.parse('1,500 JMD');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1500);
      expect(result!.currency).toBe('JMD');
    });
  });

  // ── Number word parsing ──────────────────────────────────────────────────

  describe('number word parsing', () => {
    it('parses "one hundred" as 100', () => {
      const result = parser.parse('one hundred');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(100);
    });

    it('parses "fifty" as 50', () => {
      const result = parser.parse('fifty');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(50);
    });

    it('parses "twenty five" as 25', () => {
      const result = parser.parse('twenty five');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(25);
    });

    it('parses "one thousand" as 1000', () => {
      const result = parser.parse('one thousand');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1000);
    });
  });

  // ── Context-aware parsing (dialect) ─────────────────────────────────────

  describe('parseInContext()', () => {
    it('"500" with Jamaican context → JMD', () => {
      const result = parser.parseInContext('500', 'jamaican-patois');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(500);
      expect(result!.currency).toBe('JMD');
    });

    it('"500" with Trinidadian context → JMD (Caribbean default)', () => {
      const result = parser.parseInContext('500', 'trinidadian-creole');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(500);
      expect(result!.currency).toBe('JMD');
    });

    it('"500" with standard English context → USD (default)', () => {
      const result = parser.parseInContext('500', 'standard-english');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(500);
      expect(result!.currency).toBe('USD');
    });

    it('"$50" with Jamaican context → USD (explicit symbol overrides context)', () => {
      const result = parser.parseInContext('$50', 'jamaican-patois');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(50);
      expect(result!.currency).toBe('USD'); // $ = USD explicitly
    });

    it('"two bills" with Caribbean context still gives JMD', () => {
      const result = parser.parseInContext('two bills', 'caribbean-en');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(200);
      expect(result!.currency).toBe('JMD');
    });
  });

  // ── Default currency ─────────────────────────────────────────────────────

  describe('defaultCurrency', () => {
    it('uses JMD as default when configured', () => {
      const jmdParser = new CurrencyParser({ defaultCurrency: 'JMD' });
      const result = jmdParser.parse('500');
      expect(result).not.toBeNull();
      expect(result!.currency).toBe('JMD');
    });

    it('uses USD as default when not configured', () => {
      const defaultParser = new CurrencyParser();
      const result = defaultParser.parse('500');
      expect(result).not.toBeNull();
      expect(result!.currency).toBe('USD');
    });
  });

  // ── Invalid / null inputs ─────────────────────────────────────────────────

  describe('invalid inputs', () => {
    it('returns null for pure text with no numbers or keywords', () => {
      const result = parser.parse('hello world');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = parser.parse('');
      expect(result).toBeNull();
    });

    it('returns null for whitespace only', () => {
      const result = parser.parse('   ');
      expect(result).toBeNull();
    });

    it('returns null for alphabetic-only text', () => {
      const result = parser.parse('send money please');
      expect(result).toBeNull();
    });
  });

  // ── resolveCurrency ──────────────────────────────────────────────────────

  describe('resolveCurrency()', () => {
    it('resolves "jmd" → "JMD"', () => {
      expect(parser.resolveCurrency('jmd')).toBe('JMD');
    });

    it('resolves "sats" → "SAT"', () => {
      expect(parser.resolveCurrency('sats')).toBe('SAT');
    });

    it('resolves "satoshis" → "SAT"', () => {
      expect(parser.resolveCurrency('satoshis')).toBe('SAT');
    });

    it('resolves "usd" → "USD"', () => {
      expect(parser.resolveCurrency('usd')).toBe('USD');
    });

    it('returns null for unknown currency string', () => {
      expect(parser.resolveCurrency('xyz-fake-currency')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parser.resolveCurrency('')).toBeNull();
    });
  });

  // ── Confidence scores ─────────────────────────────────────────────────────

  describe('confidence', () => {
    it('has high confidence for explicit currency symbols', () => {
      const result = parser.parse('$100');
      expect(result!.confidence).toBeGreaterThan(0.9);
    });

    it('has high confidence for explicit currency codes', () => {
      const result = parser.parse('100 USD');
      expect(result!.confidence).toBeGreaterThan(0.8);
    });

    it('has moderate confidence for bare numbers', () => {
      const result = parser.parse('500');
      // Bare numbers are less certain
      expect(result!.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });
});
