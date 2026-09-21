import { PositioningProfile } from "../types/domain";

/**
 * Storage for computed PositioningProfile results (spec section 44,
 * "Positioning Snapshots"). Swap InMemoryPositioningResultStore for a real
 * database-backed implementation of this same interface — nothing else in
 * the codebase needs to change.
 */
export interface PositioningResultStore {
  getLatest(studentId: string, roleId: string, opportunityId?: string): Promise<PositioningProfile | null>;
  save(profile: PositioningProfile): Promise<void>;
  getHistory(studentId: string, roleId: string): Promise<PositioningProfile[]>;
}
