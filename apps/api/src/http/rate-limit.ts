import { isIPv4, isIPv6 } from 'node:net';

/**
 * In-memory throttles for a single API process. They move to Postgres before
 * more than one instance runs (QS-053, docs/security/threat-model.md).
 *
 * Every store is bounded. When a store is full it first sweeps expired entries
 * with a resumable cursor (each sweep continues where the previous stopped and
 * wraps, so the whole map is covered); if it is still full of active entries it
 * evicts the one with the least time left and reports it through `onEvict`.
 * New keys are never refused just because the store is full, so filling the
 * store cannot lock everyone out.
 */
const DEFAULT_MAX_KEYS = 50_000;
const SWEEP_PER_CALL = 64;

export type EvictionListener = (store: string, key: string) => void;

/**
 * Normalises a client address for limiter keys: IPv4-mapped IPv6 becomes plain
 * IPv4 and any other IPv6 address collapses to its /64 prefix, so rotating
 * addresses inside one allocation share a bucket.
 */
export function normalizeIp(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped && isIPv4(mapped[1]!)) return mapped[1]!;
  if (!isIPv6(ip)) return ip;
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+/, '') || '0')
    .join(':')}::/64`;
}

interface BoundedStore<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): void;
  readonly size: number;
}

/**
 * Map with a size bound. `expiresAt(value)` tells when an entry stops mattering;
 * eviction prefers expired entries, then the entry closest to expiry.
 */
function createBoundedStore<V>(
  name: string,
  maxKeys: number,
  expiresAt: (value: V) => number,
  now: () => number,
  onEvict?: EvictionListener,
): BoundedStore<V> {
  const map = new Map<string, V>();
  let cursor: Iterator<[string, V]> | null = null;

  /** Visits up to `budget` entries from the saved cursor, deleting expired ones. */
  function sweep(budget: number, at: number): void {
    for (let visited = 0; visited < budget && map.size > 0; visited += 1) {
      cursor ??= map.entries();
      const next = cursor.next();
      if (next.done) {
        cursor = null;
        continue;
      }
      const [key, value] = next.value;
      if (expiresAt(value) <= at) map.delete(key);
    }
  }

  function evictLeastTimeLeft(): void {
    let victim: string | null = null;
    let soonest = Infinity;
    for (const [key, value] of map) {
      const expiry = expiresAt(value);
      if (expiry < soonest) {
        soonest = expiry;
        victim = key;
      }
    }
    if (victim !== null) {
      map.delete(victim);
      onEvict?.(name, victim);
    }
  }

  return {
    get: (key) => map.get(key),
    delete: (key) => void map.delete(key),
    get size() {
      return map.size;
    },
    set(key, value) {
      const at = now();
      sweep(SWEEP_PER_CALL, at);
      if (!map.has(key) && map.size >= maxKeys) {
        sweep(map.size + 1, at); // one full pass from the cursor
        if (map.size >= maxKeys) evictLeastTimeLeft();
      }
      map.set(key, value);
    },
  };
}

export interface LimiterOptions {
  readonly now?: () => number;
  readonly maxKeys?: number;
  readonly onEvict?: EvictionListener;
}

/** Fixed-window counter (per IP for sign-in and registration). Counts synchronously. */
export interface RateLimiter {
  hit(key: string): { allowed: boolean; retryAfterSeconds: number };
  reset(key: string): void;
}

export function createRateLimiter(
  max: number,
  windowMs: number,
  options: LimiterOptions = {},
): RateLimiter {
  const now = options.now ?? (() => Date.now());
  const store = createBoundedStore<{ count: number; resetAt: number }>(
    'fixed-window',
    options.maxKeys ?? DEFAULT_MAX_KEYS,
    (w) => w.resetAt,
    now,
    options.onEvict,
  );
  return {
    hit(key) {
      const current = now();
      const existing = store.get(key);
      const window =
        existing && existing.resetAt > current
          ? existing
          : { count: 0, resetAt: current + windowMs };
      const next = { count: window.count + 1, resetAt: window.resetAt };
      store.set(key, next);
      return {
        allowed: next.count <= max,
        retryAfterSeconds: Math.max(1, Math.ceil((next.resetAt - current) / 1000)),
      };
    },
    reset: (key) => store.delete(key),
  };
}

/**
 * Caps how many distinct keys (emails) one bucket (normalised IP) may touch per
 * window, so a single source cannot mint unlimited fresh per-email counters.
 */
export interface DistinctKeyLimiter {
  hit(bucket: string, key: string): { allowed: boolean; retryAfterSeconds: number };
}

export function createDistinctKeyLimiter(
  maxDistinct: number,
  windowMs: number,
  options: LimiterOptions = {},
): DistinctKeyLimiter {
  const now = options.now ?? (() => Date.now());
  const store = createBoundedStore<{ keys: ReadonlySet<string>; resetAt: number }>(
    'distinct-keys',
    options.maxKeys ?? DEFAULT_MAX_KEYS,
    (w) => w.resetAt,
    now,
    options.onEvict,
  );
  return {
    hit(bucket, key) {
      const current = now();
      const existing = store.get(bucket);
      const window =
        existing && existing.resetAt > current
          ? existing
          : { keys: new Set<string>(), resetAt: current + windowMs };
      const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - current) / 1000));
      if (window.keys.has(key)) return { allowed: true, retryAfterSeconds: 0 };
      if (window.keys.size >= maxDistinct) return { allowed: false, retryAfterSeconds };
      store.set(bucket, { keys: new Set([...window.keys, key]), resetAt: window.resetAt });
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

/**
 * Per-email attempt counter with progressive backoff. `attempt` is synchronous:
 * it reserves (counts) the attempt before any await, so parallel requests cannot
 * all pass the check. The first `freeAttempts` attempts are free; each further
 * one doubles the lockout (base, 2x base, ...) up to `maxLockoutMs`. A successful
 * sign-in calls `reset`.
 */
export interface BackoffLimiter {
  attempt(key: string): { allowed: boolean; retryAfterSeconds: number };
  reset(key: string): void;
}

export interface BackoffOptions extends LimiterOptions {
  readonly freeAttempts: number;
  readonly baseLockoutMs: number;
  readonly maxLockoutMs: number;
  /** Attempts older than this are forgotten. */
  readonly decayMs: number;
}

interface BackoffEntry {
  readonly attempts: number;
  readonly lockedUntil: number;
  readonly lastAttempt: number;
}

export function createBackoffLimiter(options: BackoffOptions): BackoffLimiter {
  const now = options.now ?? (() => Date.now());
  const store = createBoundedStore<BackoffEntry>(
    'login-backoff',
    options.maxKeys ?? DEFAULT_MAX_KEYS,
    (entry) => Math.max(entry.lockedUntil, entry.lastAttempt + options.decayMs),
    now,
    options.onEvict,
  );

  return {
    attempt(key) {
      const at = now();
      const stored = store.get(key);
      const entry =
        stored && Math.max(stored.lockedUntil, stored.lastAttempt + options.decayMs) > at
          ? stored
          : null;
      if (entry && entry.lockedUntil > at) {
        return { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil - at) / 1000) };
      }
      const attempts = (entry?.attempts ?? 0) + 1;
      const over = attempts - options.freeAttempts;
      const lockout =
        over > 0 ? Math.min(options.maxLockoutMs, options.baseLockoutMs * 2 ** (over - 1)) : 0;
      store.set(key, { attempts, lockedUntil: lockout > 0 ? at + lockout : 0, lastAttempt: at });
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset: (key) => store.delete(key),
  };
}
