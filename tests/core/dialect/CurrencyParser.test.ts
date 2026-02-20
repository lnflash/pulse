/**
 * CurrencyParser tests.
 */

import { CurrencyParser } from '../../../src/core/dialect/CurrencyParser';

describe('CurrencyParser', () => {
  const parser = new CurrencyParser({ defaultCurrency: 'USD' });

  describe('parse()', () => {
    it('parses simple numeric amounts', () => {
      const result = parser.parse('50 USD');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(50);
      expect(result!.currency).toBe('USD');
    });

    it('parses amounts with symbol prefix', () => {
      const result = parser.parse('$100');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(100);
    });

    it('parses amounts with commas', () => {
      const result = parser.parse('1,500 JMD');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1500);
    });

    it('parses decimal amounts', () => {
      const result = parser.parse('12.50 USD');
      expect(result).not.toBeNull();
      expect(result!.value).toBeCloseTo(12.5);
    });

    it('recognizes satoshi aliases', () => {
      const result = parser.parse('1000 sats');
      expect(result).not.toBeNull();
      expect(result!.currency).toBe('SAT');
    });

    it('returns null for non-monetary text', () => {
      const result = parser.parse('hello world');
      expect(result).toBeNull();
    });
  });

  describe('resolveCurrency()', () => {
    it('resolves "jmd" to JMD', () => {
      expect(parser.resolveCurrency('jmd')).toBe('JMD');
    });

    it('resolves "sats" to SAT', () => {
      expect(parser.resolveCurrency('sats')).toBe('SAT');
    });

    it('returns null for unknown currency', () => {
      expect(parser.resolveCurrency('xyz-unknown')).toBeNull();
    });
  });
});
