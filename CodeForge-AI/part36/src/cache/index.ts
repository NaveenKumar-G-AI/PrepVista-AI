import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * Section 49: cache expensive cohort-level views, and NEVER let a
 * cache-key mistake serve one tenant's data to another. Every call
 * site must namespace keys through this function — it is the only
 * sanctioned way to build a cache key in this codebase.
 */
export function buildTenantCacheKey(organizationId: string, ...parts: (string | number)[]): string {
  return ['org', organizationId, ...parts].join(':');
}

class InMemoryCache implements CacheProvider {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class RedisCache implements CacheProvider {
  private client: any;

  constructor(url: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require('ioredis');
    this.client = new Redis(url);
    this.client.on('error', (err: Error) => logger.error({ err }, 'Redis cache connection error'));
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}

export const cache: CacheProvider =
  env.CACHE_PROVIDER === 'redis' && env.REDIS_URL ? new RedisCache(env.REDIS_URL) : new InMemoryCache();
