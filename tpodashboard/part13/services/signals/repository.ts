// services/signals/repository.ts
//
// Persistence port. Every other service in this module depends only on
// this interface, never on a concrete ORM — implement `SignalRepository`
// against your real DB (a Prisma sketch is at the bottom of this file)
// and nothing else in Part 13 needs to change.

import type { ProactiveSignal, SignalStatus } from './types';

export interface SignalRepository {
  findOpenByDedupKey(institutionId: string, dedupKey: string): Promise<ProactiveSignal | null>;
  create(signal: Omit<ProactiveSignal, 'id'>): Promise<ProactiveSignal>;
  update(id: string, patch: Partial<ProactiveSignal>): Promise<ProactiveSignal>;
  get(id: string): Promise<ProactiveSignal | null>;
  listByStatuses(statuses: SignalStatus[], institutionId?: string): Promise<ProactiveSignal[]>;
  listByInstitution(institutionId: string): Promise<ProactiveSignal[]>;
  /** entityType === 'STUDENT' && entityId === studentId, resolved by the adapter */
  listByStudent(studentId: string): Promise<ProactiveSignal[]>;
}

/** Reference implementation for local development, tests, and demos.
 * Fully real — this is what tests/proactive/*.test.ts actually run
 * against in this sandbox. Swap for a Prisma/SQL adapter in production;
 * same interface, same callers, zero changes anywhere else. */
export class InMemorySignalRepository implements SignalRepository {
  private store = new Map<string, ProactiveSignal>();
  private idCounter = 0;

  async findOpenByDedupKey(institutionId: string, dedupKey: string): Promise<ProactiveSignal | null> {
    const openStatuses: SignalStatus[] = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'SNOOZED'];
    for (const signal of this.store.values()) {
      if (
        signal.institutionId === institutionId &&
        signal.dedupKey === dedupKey &&
        openStatuses.includes(signal.status)
      ) {
        return signal;
      }
    }
    return null;
  }

  async create(signal: Omit<ProactiveSignal, 'id'>): Promise<ProactiveSignal> {
    const id = `sig_${++this.idCounter}`;
    const created: ProactiveSignal = { ...signal, id };
    this.store.set(id, created);
    return created;
  }

  async update(id: string, patch: Partial<ProactiveSignal>): Promise<ProactiveSignal> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`Signal ${id} not found`);
    const updated = { ...existing, ...patch };
    this.store.set(id, updated);
    return updated;
  }

  async get(id: string): Promise<ProactiveSignal | null> {
    return this.store.get(id) ?? null;
  }

  async listByStatuses(statuses: SignalStatus[], institutionId?: string): Promise<ProactiveSignal[]> {
    return [...this.store.values()].filter(
      (s) => statuses.includes(s.status) && (institutionId ? s.institutionId === institutionId : true),
    );
  }

  async listByInstitution(institutionId: string): Promise<ProactiveSignal[]> {
    return [...this.store.values()].filter((s) => s.institutionId === institutionId);
  }

  async listByStudent(studentId: string): Promise<ProactiveSignal[]> {
    return [...this.store.values()].filter((s) => s.entityType === 'STUDENT' && s.entityId === studentId);
  }
}

/*
PRISMA ADAPTER — worked example, intentionally not wired up (no schema or
generated client exists in this sandbox to compile it against). Matches
prisma/part13_proactive_signals.prisma field-for-field.

  export class PrismaSignalRepository implements SignalRepository {
    constructor(private prisma: PrismaClient) {}

    async findOpenByDedupKey(institutionId: string, dedupKey: string) {
      const row = await this.prisma.proactiveSignal.findFirst({
        where: {
          institutionId,
          dedupKey,
          status: { in: ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'SNOOZED'] },
        },
      });
      return row ? toDomain(row) : null;
    }

    async create(signal: Omit<ProactiveSignal, 'id'>) {
      const row = await this.prisma.proactiveSignal.create({ data: toRow(signal) });
      return toDomain(row);
    }

    // ...update/get/listByStatuses/listByInstitution/listByStudent follow
    // the same pattern: a Prisma call in, toDomain()/toRow() mapping at
    // the edge, a plain ProactiveSignal out. Keep ALL Prisma-specific
    // code inside this one file — every other service in this module
    // only ever sees the SignalRepository interface.
  }
*/
