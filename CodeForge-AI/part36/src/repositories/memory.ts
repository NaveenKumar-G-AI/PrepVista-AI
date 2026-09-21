import { randomUUID } from 'crypto';
import type {
  Cohort,
  Membership,
  SkillAggregate,
  RoleAggregate,
  TrainingInsight,
  CohortSnapshotRecord,
  AuditEntry,
  PrivacyPolicyRecord,
} from '../domain/types';
import type {
  CohortRepository,
  CreateCohortInput,
  CohortFilter,
  MembershipRepository,
  SkillAggregateRepository,
  RoleAggregateRepository,
  TrainingInsightRepository,
  SnapshotRepository,
  AuditRepository,
  PrivacyPolicyRepository,
  EventRepository,
  EventRecord,
  Repositories,
} from './types';
import { NotFoundError, ConflictError } from '../utils/errors';
import { env } from '../config/env';

// Module-level state — lives for the process lifetime. Good for local
// dev, demos, and tests; NOT for multi-instance production deployment
// (use the Prisma-backed repositories there — see prisma.ts / index.ts).

class InMemoryCohortRepository implements CohortRepository {
  private rows = new Map<string, Cohort>();

  async create(input: CreateCohortInput): Promise<Cohort> {
    const now = new Date();
    const cohort: Cohort = {
      id: randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      kind: input.kind,
      dimension: input.dimension,
      parentCohortId: input.parentCohortId ?? null,
      attributes: input.attributes ?? {},
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(cohort.id, cohort);
    return cohort;
  }

  async findById(organizationId: string, cohortId: string): Promise<Cohort | null> {
    const cohort = this.rows.get(cohortId);
    if (!cohort || cohort.organizationId !== organizationId) return null;
    return cohort;
  }

  async list(organizationId: string, filter?: CohortFilter): Promise<Cohort[]> {
    return [...this.rows.values()].filter((c) => {
      if (c.organizationId !== organizationId) return false;
      if (filter?.kind && c.kind !== filter.kind) return false;
      if (filter?.isActive !== undefined && c.isActive !== filter.isActive) return false;
      if (filter?.parentCohortId !== undefined && c.parentCohortId !== filter.parentCohortId) return false;
      return true;
    });
  }

  async update(
    organizationId: string,
    cohortId: string,
    patch: Partial<Pick<Cohort, 'name' | 'attributes' | 'isActive'>>
  ): Promise<Cohort> {
    const existing = await this.findById(organizationId, cohortId);
    if (!existing) throw new NotFoundError('Cohort not found.');
    const updated: Cohort = { ...existing, ...patch, updatedAt: new Date() };
    this.rows.set(cohortId, updated);
    return updated;
  }
}

class InMemoryMembershipRepository implements MembershipRepository {
  private rows = new Map<string, Membership>();

  private key(cohortId: string, studentId: string) {
    return `${cohortId}:${studentId}`;
  }

  async add(organizationId: string, cohortId: string, studentId: string): Promise<Membership> {
    const key = this.key(cohortId, studentId);
    const existing = this.rows.get(key);
    if (existing && existing.isActive) {
      throw new ConflictError('Student is already an active member of this cohort.');
    }
    const membership: Membership = {
      id: existing?.id ?? randomUUID(),
      organizationId,
      cohortId,
      studentId,
      joinedAt: new Date(),
      leftAt: null,
      isActive: true,
    };
    this.rows.set(key, membership);
    return membership;
  }

  async remove(organizationId: string, cohortId: string, studentId: string): Promise<void> {
    const key = this.key(cohortId, studentId);
    const existing = this.rows.get(key);
    if (existing) {
      this.rows.set(key, { ...existing, isActive: false, leftAt: new Date() });
    }
  }

  async listStudentIds(organizationId: string, cohortId: string): Promise<string[]> {
    return [...this.rows.values()]
      .filter((m) => m.organizationId === organizationId && m.cohortId === cohortId && m.isActive)
      .map((m) => m.studentId);
  }

  async listCohortIdsForStudent(organizationId: string, studentId: string): Promise<string[]> {
    return [...this.rows.values()]
      .filter((m) => m.organizationId === organizationId && m.studentId === studentId && m.isActive)
      .map((m) => m.cohortId);
  }

  async count(organizationId: string, cohortId: string): Promise<number> {
    return (await this.listStudentIds(organizationId, cohortId)).length;
  }
}

class InMemorySkillAggregateRepository implements SkillAggregateRepository {
  private rows: SkillAggregate[] = [];

  async upsertMany(aggregates: Omit<SkillAggregate, 'id'>[]): Promise<SkillAggregate[]> {
    const created = aggregates.map((a) => ({ ...a, id: randomUUID() }));
    this.rows.push(...created);
    return created;
  }

  async listLatestForCohort(organizationId: string, cohortId: string): Promise<SkillAggregate[]> {
    const matches = this.rows.filter((r) => r.organizationId === organizationId && r.cohortId === cohortId);
    const latestBySkill = new Map<string, SkillAggregate>();
    for (const row of matches) {
      const existing = latestBySkill.get(row.skillId);
      if (!existing || row.computedAt > existing.computedAt) latestBySkill.set(row.skillId, row);
    }
    return [...latestBySkill.values()];
  }

  async listHistoryForSkill(
    organizationId: string,
    cohortId: string,
    skillId: string,
    limit = 12
  ): Promise<SkillAggregate[]> {
    return this.rows
      .filter((r) => r.organizationId === organizationId && r.cohortId === cohortId && r.skillId === skillId)
      .sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime())
      .slice(0, limit);
  }
}

class InMemoryRoleAggregateRepository implements RoleAggregateRepository {
  private rows: RoleAggregate[] = [];

  async upsertMany(aggregates: Omit<RoleAggregate, 'id'>[]): Promise<RoleAggregate[]> {
    const created = aggregates.map((a) => ({ ...a, id: randomUUID() }));
    this.rows.push(...created);
    return created;
  }

  async listLatestForCohort(organizationId: string, cohortId: string): Promise<RoleAggregate[]> {
    const matches = this.rows.filter((r) => r.organizationId === organizationId && r.cohortId === cohortId);
    const latestByRole = new Map<string, RoleAggregate>();
    for (const row of matches) {
      const existing = latestByRole.get(row.roleId);
      if (!existing || row.computedAt > existing.computedAt) latestByRole.set(row.roleId, row);
    }
    return [...latestByRole.values()];
  }
}

class InMemoryTrainingInsightRepository implements TrainingInsightRepository {
  private rows = new Map<string, TrainingInsight[]>();

  async replaceForCohort(
    organizationId: string,
    cohortId: string,
    insights: Omit<TrainingInsight, 'id'>[]
  ): Promise<TrainingInsight[]> {
    const created = insights.map((i) => ({ ...i, id: randomUUID() }));
    this.rows.set(cohortId, created);
    return created;
  }

  async listForCohort(organizationId: string, cohortId: string): Promise<TrainingInsight[]> {
    return (this.rows.get(cohortId) ?? []).filter((i) => i.organizationId === organizationId);
  }
}

class InMemorySnapshotRepository implements SnapshotRepository {
  private rows: CohortSnapshotRecord[] = [];

  async create(snapshot: Omit<CohortSnapshotRecord, 'id' | 'createdAt'>): Promise<CohortSnapshotRecord> {
    const existing = this.rows.find((r) => r.cohortId === snapshot.cohortId && r.periodLabel === snapshot.periodLabel);
    if (existing) throw new ConflictError('A snapshot for this period already exists.');
    const created: CohortSnapshotRecord = { ...snapshot, id: randomUUID(), createdAt: new Date() };
    this.rows.push(created);
    return created;
  }

  async list(organizationId: string, cohortId: string, limit = 24): Promise<CohortSnapshotRecord[]> {
    return this.rows
      .filter((r) => r.organizationId === organizationId && r.cohortId === cohortId)
      .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
      .slice(0, limit);
  }

  async findByPeriod(organizationId: string, cohortId: string, periodLabel: string): Promise<CohortSnapshotRecord | null> {
    return (
      this.rows.find((r) => r.organizationId === organizationId && r.cohortId === cohortId && r.periodLabel === periodLabel) ??
      null
    );
  }
}

class InMemoryAuditRepository implements AuditRepository {
  private rows: AuditEntry[] = [];

  async record(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<AuditEntry> {
    const created: AuditEntry = { ...entry, id: randomUUID(), createdAt: new Date() };
    this.rows.push(created);
    return created;
  }

  async list(organizationId: string, limit = 100): Promise<AuditEntry[]> {
    return this.rows
      .filter((r) => r.organizationId === organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

class InMemoryPrivacyPolicyRepository implements PrivacyPolicyRepository {
  private rows = new Map<string, PrivacyPolicyRecord>();

  async get(organizationId: string): Promise<PrivacyPolicyRecord> {
    return (
      this.rows.get(organizationId) ?? {
        organizationId,
        minCohortSize: env.PRIVACY_MIN_COHORT_SIZE,
        minCoverageForClaim: env.PRIVACY_MIN_COVERAGE_FOR_CLAIM,
      }
    );
  }

  async set(
    organizationId: string,
    patch: Partial<Omit<PrivacyPolicyRecord, 'organizationId'>>
  ): Promise<PrivacyPolicyRecord> {
    const current = await this.get(organizationId);
    const updated = { ...current, ...patch };
    this.rows.set(organizationId, updated);
    return updated;
  }
}

class InMemoryEventRepository implements EventRepository {
  private rows = new Map<string, EventRecord>();

  async recordIfNew(event: Omit<EventRecord, 'id' | 'status' | 'processedAt'>): Promise<EventRecord | null> {
    if (this.rows.has(event.sourceEventId)) return null; // idempotent no-op (section 76)
    const created: EventRecord = { ...event, id: randomUUID(), status: 'PENDING', processedAt: null };
    this.rows.set(event.sourceEventId, created);
    return created;
  }

  async markProcessed(id: string): Promise<void> {
    for (const [key, row] of this.rows) {
      if (row.id === id) this.rows.set(key, { ...row, status: 'PROCESSED', processedAt: new Date() });
    }
  }

  async markFailed(id: string, _reason: string): Promise<void> {
    for (const [key, row] of this.rows) {
      if (row.id === id) this.rows.set(key, { ...row, status: 'FAILED' });
    }
  }
}

export function createMemoryRepositories(): Repositories {
  return {
    cohorts: new InMemoryCohortRepository(),
    memberships: new InMemoryMembershipRepository(),
    skillAggregates: new InMemorySkillAggregateRepository(),
    roleAggregates: new InMemoryRoleAggregateRepository(),
    trainingInsights: new InMemoryTrainingInsightRepository(),
    snapshots: new InMemorySnapshotRepository(),
    audit: new InMemoryAuditRepository(),
    privacyPolicy: new InMemoryPrivacyPolicyRepository(),
    events: new InMemoryEventRepository(),
  };
}
