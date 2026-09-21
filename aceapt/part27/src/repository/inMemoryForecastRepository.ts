import type { ForecastSnapshotRecord } from "../domain/types.js";
import type { ForecastRepository } from "./forecastRepository.js";

export class InMemoryForecastRepository implements ForecastRepository {
  private history = new Map<string, ForecastSnapshotRecord[]>();

  async saveForecastSnapshot(record: ForecastSnapshotRecord): Promise<void> {
    const existing = this.history.get(record.studentId) ?? [];
    this.history.set(record.studentId, [...existing, record]);
  }

  async getForecastHistory(studentId: string, limit = 50): Promise<ForecastSnapshotRecord[]> {
    const records = this.history.get(studentId) ?? [];
    return [...records].sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()).slice(0, limit);
  }

  async getLatestForecastSnapshot(studentId: string): Promise<ForecastSnapshotRecord | null> {
    const records = this.history.get(studentId);
    if (!records || records.length === 0) return null;
    return records[records.length - 1] ?? null;
  }
}

export function isStale(record: ForecastSnapshotRecord | null, maxAgeMs: number, now: Date = new Date()): boolean {
  if (!record) return true;
  return now.getTime() - new Date(record.generatedAt).getTime() > maxAgeMs;
}
