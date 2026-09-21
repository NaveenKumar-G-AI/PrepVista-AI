import { createHash } from 'crypto';
import { CacheScope } from '../types';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  invalidations: number;
}

/**
 * Cache keys are built so that isolation is structural, not a matter of
 * remembering to check: CacheScope.USER always folds the user id into the
 * key, CacheScope.TENANT always folds the org id in (but not the user),
 * and CacheScope.NONE bypasses the cache entirely. There is no code path
 * that can accidentally build a USER-scope key without the user id in it
 * — see buildKey below. This is what makes "Student A's cached response
 * reaching Student B" structurally impossible rather than just unlikely.
 *
 * Keys also fold in promptVersion/modelId/policyVersion so that changing
 * any of those naturally invalidates old entries instead of serving stale
 * output under a new prompt or policy (see CACHE VERSIONING in the spec).
 */
export class CacheLayer {
  private store = new Map<string, CacheEntry>();
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, invalidations: 0 };
  private estimatedSavedUsd = 0;

  buildKey(params: {
    scope: CacheScope;
    organizationId: string;
    userId?: string;
    task: string;
    inputHash: string;
    modelId: string;
    promptVersion: string;
    policyVersion: number;
  }): string | null {
    if (params.scope === CacheScope.NONE) return null;

    const parts = ['v1', params.task, params.modelId, params.promptVersion, `pv${params.policyVersion}`, params.inputHash];

    if (params.scope === CacheScope.TENANT) {
      parts.unshift(`org:${params.organizationId}`);
    } else if (params.scope === CacheScope.USER) {
      if (!params.userId) {
        // A USER-scoped cache entry with no user id would be
        // indistinguishable from every other user's — refuse to build a
        // key rather than silently widening the scope.
        return null;
      }
      parts.unshift(`org:${params.organizationId}`, `user:${params.userId}`);
    }
    // CacheScope.GLOBAL: no org/user prefix at all — deliberately shared
    // platform-wide, only appropriate for responses proven not to depend
    // on any private input (see CacheScope doc in types/index.ts).

    return parts.join('::');
  }

  static hashInput(input: string): string {
    return createHash('sha256').update(input).digest('hex').slice(0, 32);
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return undefined;
    }
    this.stats.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: string): void {
    if (this.store.delete(key)) this.stats.invalidations++;
  }

  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    this.stats.invalidations += count;
    return count;
  }

  recordSavedCost(usd: number): void {
    // Only ever called on a confirmed cache hit that avoided a real
    // provider call — never estimated speculatively (spec: "only report
    // cost savings when they can be calculated reliably").
    this.estimatedSavedUsd += usd;
  }

  getStats(): CacheStats & { hitRate: number; estimatedSavedUsd: number; size: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total === 0 ? 0 : this.stats.hits / total,
      estimatedSavedUsd: this.estimatedSavedUsd,
      size: this.store.size,
    };
  }
}

export const cacheLayer = new CacheLayer();

/**
 * Which task types are safe to cache at all, and at what scope. Anything
 * not listed here defaults to CacheScope.NONE — caching is opt-in per
 * task, never opt-out, because the cost of under-caching is wasted money
 * but the cost of over-caching is a privacy incident.
 */
export const TASK_CACHE_SCOPE: Partial<Record<string, CacheScope>> = {
  CLASSIFICATION: CacheScope.TENANT,
  CODE_ANALYSIS: CacheScope.USER,
  TECHNICAL_COACHING: CacheScope.USER,
};
