import { describe, expect, it, vi } from 'vitest';
import {
  createBackoffLimiter,
  createDistinctKeyLimiter,
  createRateLimiter,
  normalizeIp,
} from '../src/http/rate-limit.js';

describe('fixed-window limiter', () => {
  it('allows max hits per window and then resets', () => {
    let now = 0;
    const limiter = createRateLimiter(2, 1000, { now: () => now });
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(true);
    const blocked = limiter.hit('k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(limiter.hit('other').allowed).toBe(true);
    now = 1000;
    expect(limiter.hit('k').allowed).toBe(true);
    limiter.reset('k');
    expect(limiter.hit('k').allowed).toBe(true);
  });

  it('sweeps expired windows before evicting, and never refuses new keys when full', () => {
    let now = 0;
    const onEvict = vi.fn();
    const limiter = createRateLimiter(1, 1000, { now: () => now, maxKeys: 3, onEvict });
    limiter.hit('a');
    now = 500;
    limiter.hit('b');
    limiter.hit('c');
    now = 1200; // "a" expired: swept, no eviction needed
    expect(limiter.hit('d').allowed).toBe(true);
    expect(onEvict).not.toHaveBeenCalled();
    expect(limiter.hit('b').allowed).toBe(false); // still tracked
    expect(limiter.hit('e').allowed).toBe(true); // full of active windows: evict least time left
    expect(onEvict).toHaveBeenCalledTimes(1);
  });
});

describe('progressive backoff limiter', () => {
  const base = { freeAttempts: 2, baseLockoutMs: 1000, maxLockoutMs: 4000, decayMs: 60_000 };

  it('reserves attempts synchronously and doubles the lockout up to the cap', () => {
    let now = 0;
    const limiter = createBackoffLimiter({ ...base, now: () => now });
    expect(limiter.attempt('a').allowed).toBe(true);
    expect(limiter.attempt('a').allowed).toBe(true);
    expect(limiter.attempt('a').allowed).toBe(true); // third attempt allowed, starts 1 s lockout
    expect(limiter.attempt('a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
    now = 1000;
    expect(limiter.attempt('a').allowed).toBe(true); // locks 2 s
    expect(limiter.attempt('a').retryAfterSeconds).toBe(2);
    now = 3000;
    limiter.attempt('a'); // 4 s
    now = 7000;
    limiter.attempt('a'); // capped at 4 s
    expect(limiter.attempt('a').retryAfterSeconds).toBe(4);
  });

  it('forgets attempts after the decay period and on reset', () => {
    let now = 0;
    const limiter = createBackoffLimiter({ ...base, now: () => now });
    for (let i = 0; i < 3; i += 1) limiter.attempt('a');
    expect(limiter.attempt('a').allowed).toBe(false);
    limiter.reset('a');
    expect(limiter.attempt('a').allowed).toBe(true);
    for (let i = 0; i < 3; i += 1) limiter.attempt('b');
    now = 120_000;
    expect(limiter.attempt('b').allowed).toBe(true);
    expect(limiter.attempt('b').allowed).toBe(true); // counter restarted
  });

  it('when full of active lockouts, evicts the one with the least time left instead of refusing', () => {
    let now = 0;
    const onEvict = vi.fn();
    const limiter = createBackoffLimiter({
      ...base,
      freeAttempts: 1,
      now: () => now,
      maxKeys: 2,
      onEvict,
    });
    limiter.attempt('long');
    limiter.attempt('long'); // locked 1 s
    now = 10;
    limiter.attempt('short');
    expect(limiter.attempt('newcomer').allowed).toBe(true);
    expect(onEvict).toHaveBeenCalledWith('login-backoff', 'long');
  });
});

describe('distinct-key limiter', () => {
  it('caps distinct keys per bucket per window', () => {
    let now = 0;
    const limiter = createDistinctKeyLimiter(2, 1000, { now: () => now });
    expect(limiter.hit('ip', 'a').allowed).toBe(true);
    expect(limiter.hit('ip', 'b').allowed).toBe(true);
    expect(limiter.hit('ip', 'a').allowed).toBe(true); // repeat key is free
    expect(limiter.hit('ip', 'c')).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.hit('other', 'c').allowed).toBe(true);
    now = 1000;
    expect(limiter.hit('ip', 'c').allowed).toBe(true);
  });
});

describe('normalizeIp', () => {
  it('maps IPv4-mapped IPv6 to IPv4 and collapses IPv6 to /64', () => {
    expect(normalizeIp('::ffff:10.0.0.7')).toBe('10.0.0.7');
    expect(normalizeIp('10.0.0.7')).toBe('10.0.0.7');
    expect(normalizeIp('2001:db8:aa:bb:1:2:3:4')).toBe('2001:db8:aa:bb::/64');
    expect(normalizeIp('2001:0db8:00aa::1')).toBe('2001:db8:aa:0::/64');
    expect(normalizeIp('::1')).toBe('0:0:0:0::/64');
    expect(normalizeIp('not-an-ip')).toBe('not-an-ip');
  });
});
