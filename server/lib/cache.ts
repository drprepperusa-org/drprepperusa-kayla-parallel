/**
 * @file server/lib/cache.ts
 * @description In-memory TTL cache for shipping rates.
 *
 * - 30-minute TTL for rate responses (configurable)
 * - Cache key: orderId (rates are order-specific)
 * - Redis-ready: swap CacheStore implementation without changing interface
 * - Cache stats logging for DJ debugging
 *
 * Thread safety: Node.js is single-threaded; no locks needed for in-memory.
 */

import { createLogger } from './logger.js';

const log = createLogger('cache');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  value: T;
  cachedAt: Date;
  expiresAt: Date;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache implementation
// ─────────────────────────────────────────────────────────────────────────────

/** Default TTL: 30 minutes in milliseconds. */
export const RATES_CACHE_TTL_MS = 30 * 60 * 1000;

export class InMemoryCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;
  private readonly ttlMs: number;
  private readonly name: string;

  constructor(name: string, ttlMs = RATES_CACHE_TTL_MS) {
    this.name = name;
    this.ttlMs = ttlMs;
  }

  get(key: string): CacheEntry<T> | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      log.debug({ cache: this.name, key, event: 'miss' }, 'Cache miss');
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt.getTime()) {
      this.store.delete(key);
      this.misses++;
      log.debug({ cache: this.name, key, event: 'expired' }, 'Cache entry expired');
      return null;
    }

    this.hits++;
    log.debug({ cache: this.name, key, event: 'hit' }, 'Cache hit');
    return entry;
  }

  set(key: string, value: T): CacheEntry<T> {
    const now = new Date();
    const entry: CacheEntry<T> = {
      value,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };
    this.store.set(key, entry);
    log.debug({ cache: this.name, key, ttlMs: this.ttlMs }, 'Cache set');
    return entry;
  }

  /** Delete a specific key. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Clear all entries (e.g., on settings change). */
  clear(): void {
    const size = this.store.size;
    this.store.clear();
    log.info({ cache: this.name, clearedEntries: size }, 'Cache cleared');
  }

  /** Get cache statistics for debugging. */
  stats(): CacheStats {
    // Prune expired entries first
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt.getTime()) {
        this.store.delete(key);
      }
    }

    const total = this.hits + this.misses;
    const hitRate = total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : 'N/A';

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
      hitRate,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton rate cache
// Use unknown for ProxyRate to avoid circular imports — callers cast to their type
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ratesCache: InMemoryCache<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRatesCache(): InMemoryCache<any> {
  if (!_ratesCache) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _ratesCache = new InMemoryCache<any>('rates', RATES_CACHE_TTL_MS);
  }
  return _ratesCache;
}

/** Reset cache (for testing). */
export function resetRatesCache(): void {
  _ratesCache = null;
}
