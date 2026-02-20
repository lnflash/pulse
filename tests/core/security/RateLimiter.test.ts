/**
 * RateLimiter tests.
 */

import { RateLimiter } from '../../../src/core/security/RateLimiter';

describe('RateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = new RateLimiter();
    const result = limiter.check('user-1', 'standard');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('blocks when limit is exceeded', () => {
    const limiter = new RateLimiter();
    // standard tier: 30 requests per minute
    for (let i = 0; i < 30; i++) {
      limiter.check('user-2', 'standard');
    }
    const result = limiter.check('user-2', 'standard');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.message).toBeDefined();
  });

  it('resets the window correctly', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 30; i++) {
      limiter.check('user-3', 'standard');
    }
    limiter.reset('user-3');
    const result = limiter.check('user-3', 'standard');
    expect(result.allowed).toBe(true);
  });

  it('tracks different users independently', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 30; i++) {
      limiter.check('user-a', 'standard');
    }
    const result = limiter.check('user-b', 'standard');
    expect(result.allowed).toBe(true);
  });

  it('trusted tier has higher limits', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 100; i++) {
      const r = limiter.check('trusted-user', 'trusted');
      expect(r.allowed).toBe(true);
    }
  });
});
