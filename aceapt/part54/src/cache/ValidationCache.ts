import { cacheKey } from "../hashing/contentHash.js";
import type { ValidationResult } from "../contracts/types.js";

/**
 * spec §61/§165: cache is keyed on (content hash, validator version, mode) so a
 * cache hit is only ever served for the EXACT same immutable input a validator
 * would have seen. Nothing here decides freshness relative to "the current
 * question" — that's ValidationFreshnessService's job, which sits above the
 * cache and decides whether to even consult it.
 */
export interface ValidationCache {
  get(contentHash: string, validatorName: string, validatorVersion: string, mode: string): Promise<ValidationResult | null>;
  set(contentHash: string, validatorName: string, validatorVersion: string, mode: string, result: ValidationResult): Promise<void>;
  /** spec §200: a validator version bump must invalidate everything cached under the old version. */
  invalidateValidator(validatorName: string, oldVersion: string): Promise<number>;
  invalidateQuestionVersion(contentHash: string): Promise<number>;
}

/**
 * In-memory implementation used in this delivery and in tests. Swap for a
 * Redis-backed implementation of the same interface in production — nothing
 * above this layer (executor, service) knows or cares which one is wired in.
 */
export class InMemoryValidationCache implements ValidationCache {
  private readonly store = new Map<string, { result: ValidationResult; contentHash: string; validatorName: string; validatorVersion: string }>();

  async get(contentHash: string, validatorName: string, validatorVersion: string, mode: string): Promise<ValidationResult | null> {
    const entry = this.store.get(cacheKey(contentHash, validatorName, validatorVersion, mode));
    return entry ? entry.result : null;
  }

  async set(contentHash: string, validatorName: string, validatorVersion: string, mode: string, result: ValidationResult): Promise<void> {
    this.store.set(cacheKey(contentHash, validatorName, validatorVersion, mode), { result, contentHash, validatorName, validatorVersion });
  }

  async invalidateValidator(validatorName: string, oldVersion: string): Promise<number> {
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (entry.validatorName === validatorName && entry.validatorVersion === oldVersion) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  async invalidateQuestionVersion(contentHash: string): Promise<number> {
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (entry.contentHash === contentHash) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Test/ops helper — not part of the interface. */
  size(): number {
    return this.store.size;
  }
}
