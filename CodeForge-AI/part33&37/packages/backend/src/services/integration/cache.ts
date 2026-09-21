/**
 * Cache Isolation Utility
 * Ensures tenant and identity boundaries in cache keys
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
    });
  }
  return redisClient;
}

export interface CacheOptions {
  ttlSeconds?: number;
  tenantId: string;
  identityId?: string;
  resourceType: string;
}

/**
 * Builds a tenant-isolated cache key
 */
function buildCacheKey(tenantId: string, identityId: string | undefined, resourceType: string, suffix: string): string {
  const identityPart = identityId ? `:id:${identityId}` : '';
  return `integration:${tenantId}${identityPart}:${resourceType}:${suffix}`;
}

/**
 * Gets cached value with tenant isolation
 */
export async function getCached<T>(key: string, options: CacheOptions): Promise<T | null> {
  try {
    const client = getRedisClient();
    const fullKey = buildCacheKey(options.tenantId, options.identityId, options.resourceType, key);
    const cached = await client.get(fullKey);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch {
    // Cache failures should not break the integration
    return null;
  }
}

/**
 * Sets cached value with tenant isolation
 */
export async function setCached(key: string, value: unknown, options: CacheOptions): Promise<void> {
  try {
    const client = getRedisClient();
    const fullKey = buildCacheKey(options.tenantId, options.identityId, options.resourceType, key);
    await client.set(fullKey, JSON.stringify(value), 'EX', options.ttlSeconds ?? 300);
  } catch {
    // Cache failures should not break the integration
  }
}

/**
 * Deletes tenant-isolated cache entries
 */
export async function deleteCached(key: string, options: CacheOptions): Promise<void> {
  try {
    const client = getRedisClient();
    const fullKey = buildCacheKey(options.tenantId, options.identityId, options.resourceType, key);
    await client.del(fullKey);
  } catch {
    // Cache failures should not break the integration
  }
}

/**
 * Invalidates all cached entries for a tenant
 */
export async function invalidateTenant(tenantId: string): Promise<void> {
  try {
    const client = getRedisClient();
    const pattern = `integration:${tenantId}:*`;
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch {
    // Cache failures should not break the integration
  }
}