import type { ForecastSnapshotRecord } from "../domain/types.js";

/**
 * Storage-agnostic on purpose (spec section 58: "First inspect the existing
 * schema"). Implement this against your real DB/ORM — nothing in
 * services/forecastOrchestrator.ts cares which implementation it's given.
 */
export interface ForecastRepository {
  saveForecastSnapshot(record: ForecastSnapshotRecord): Promise<void>;
  getForecastHistory(studentId: string, limit?: number): Promise<ForecastSnapshotRecord[]>;
  getLatestForecastSnapshot(studentId: string): Promise<ForecastSnapshotRecord | null>;
}
