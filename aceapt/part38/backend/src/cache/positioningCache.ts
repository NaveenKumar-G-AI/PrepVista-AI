import { PositioningProfile } from "../types/domain";

interface CacheEntry {
  value: PositioningProfile;
  cachedAt: number;
}

const TTL_MS = 5 * 60 * 1000;

/**
 * Avoids re-running the full pipeline on every page load (spec section 53).
 * Call invalidateStudent() from wherever new evidence/projects/roles land
 * (spec section 54's event list) once those hooks exist for real.
 */
export class PositioningCache {
  private store = new Map<string, CacheEntry>();

  private key(studentId: string, roleId: string, opportunityId?: string): string {
    return `${studentId}:${roleId}:${opportunityId ?? "-"}`;
  }

  get(studentId: string, roleId: string, opportunityId?: string): PositioningProfile | null {
    const k = this.key(studentId, roleId, opportunityId);
    const entry = this.store.get(k);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > TTL_MS) {
      this.store.delete(k);
      return null;
    }
    return entry.value;
  }

  set(studentId: string, roleId: string, opportunityId: string | undefined, value: PositioningProfile): void {
    this.store.set(this.key(studentId, roleId, opportunityId), { value, cachedAt: Date.now() });
  }

  invalidateStudent(studentId: string): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(`${studentId}:`)) this.store.delete(k);
    }
  }
}

export const positioningCache = new PositioningCache();
