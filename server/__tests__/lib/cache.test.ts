/**
 * @file server/__tests__/lib/cache.test.ts
 * @description Unit tests for the in-memory cache.
 *
 * Tests:
 * - Cache hit after set
 * - Cache miss for expired entries
 * - Cache miss for unknown keys
 * - Cache clear
 * - Cache stats (hits, misses, hit rate)
 * - Custom TTL
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryCache, RATES_CACHE_TTL_MS } from '../../lib/cache.js';

describe('InMemoryCache', () => {
  let cache: InMemoryCache<string>;

  beforeEach(() => {
    cache = new InMemoryCache<string>('test', 1000); // 1s TTL for tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for unknown key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('returns entry after set', () => {
    cache.set('key1', 'value1');
    const entry = cache.get('key1');
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe('value1');
  });

  it('returns entry metadata (cachedAt, expiresAt)', () => {
    const before = new Date();
    cache.set('key2', 'value2');
    const entry = cache.get('key2');
    expect(entry!.cachedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entry!.expiresAt.getTime()).toBeGreaterThan(entry!.cachedAt.getTime());
  });

  it('returns null for expired entry', () => {
    cache.set('key3', 'value3');

    // Advance time past TTL (1000ms)
    vi.advanceTimersByTime(1001);

    expect(cache.get('key3')).toBeNull();
  });

  it('does not expire before TTL', () => {
    cache.set('key4', 'value4');
    vi.advanceTimersByTime(999);
    expect(cache.get('key4')).not.toBeNull();
  });

  it('delete removes an entry', () => {
    cache.set('key5', 'value5');
    expect(cache.get('key5')).not.toBeNull();
    cache.delete('key5');
    expect(cache.get('key5')).toBeNull();
  });

  it('clear removes all entries', () => {
    cache.set('a', 'va');
    cache.set('b', 'vb');
    cache.set('c', 'vc');
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
    expect(cache.get('c')).toBeNull();
  });

  describe('stats()', () => {
    it('tracks hits and misses', () => {
      cache.set('s1', 'v1');
      cache.get('s1'); // hit
      cache.get('s1'); // hit
      cache.get('missing'); // miss

      const stats = cache.stats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('calculates hit rate', () => {
      cache.set('s2', 'v2');
      cache.get('s2'); // hit
      cache.get('miss1'); // miss
      cache.get('miss2'); // miss
      cache.get('miss3'); // miss

      const stats = cache.stats();
      expect(stats.hitRate).toBe('25.0%');
    });

    it('returns N/A hit rate when no requests', () => {
      const stats = cache.stats();
      expect(stats.hitRate).toBe('N/A');
    });

    it('does not count expired entries in size', () => {
      cache.set('exp1', 'v1');
      cache.set('exp2', 'v2');
      vi.advanceTimersByTime(1001);
      const stats = cache.stats();
      expect(stats.size).toBe(0);
    });
  });

  it('default TTL is 30 minutes', () => {
    expect(RATES_CACHE_TTL_MS).toBe(30 * 60 * 1000);
  });
});
