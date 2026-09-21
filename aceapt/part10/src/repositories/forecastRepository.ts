import { Forecast } from '../types';

export interface ForecastRepository {
  save(forecast: Forecast): Promise<Forecast>;
  getCurrent(studentId: string): Promise<Forecast | null>;
  getHistory(studentId: string, limit?: number): Promise<Forecast[]>;
  getById(id: string): Promise<Forecast | null>;
}

/**
 * Reference in-memory implementation so the engine can run and be
 * tested without a live database. Swap for a Prisma-backed repository
 * (see prisma/schema.prisma) that implements this same interface - no
 * other file needs to change. SS55 Data Model, SS56 Service Architecture.
 */
export class InMemoryForecastRepository implements ForecastRepository {
  private byId = new Map<string, Forecast>();
  private byStudent = new Map<string, string[]>(); // studentId -> ordered forecast ids

  async save(forecast: Forecast): Promise<Forecast> {
    const id = forecast.id ?? `fc_${Math.random().toString(36).slice(2, 10)}`;
    const saved = { ...forecast, id };
    this.byId.set(id, saved);
    const list = this.byStudent.get(forecast.studentId) ?? [];
    list.push(id);
    this.byStudent.set(forecast.studentId, list);
    return saved;
  }

  async getCurrent(studentId: string): Promise<Forecast | null> {
    const ids = this.byStudent.get(studentId);
    if (!ids || ids.length === 0) return null;
    return this.byId.get(ids[ids.length - 1]) ?? null;
  }

  async getHistory(studentId: string, limit = 20): Promise<Forecast[]> {
    const ids = this.byStudent.get(studentId) ?? [];
    return ids
      .slice(-limit)
      .map((id) => this.byId.get(id))
      .filter((f): f is Forecast => !!f);
  }

  async getById(id: string): Promise<Forecast | null> {
    return this.byId.get(id) ?? null;
  }
}
