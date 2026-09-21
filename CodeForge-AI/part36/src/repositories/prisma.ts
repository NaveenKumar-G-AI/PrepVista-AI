import type { PrismaClient } from '@prisma/client';
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
import type {
  MasteryLevel,
  EvidenceCoverageState,
  TrendDirection,
  ReadinessState,
  GapPriority,
} from '../domain/enums';
import type { InterventionCategory } from '../domain/enums';

/* eslint-disable @typescript-eslint/no-explicit-any */
// JSON columns and enum columns lose static type information at the
// Prisma boundary; the `any` casts below are confined to this file
// (the mapping layer) and never leak into services or the API.

function toCohort(row: any): Cohort {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    kind: row.kind,
    dimension: row.dimension,
    parentCohortId: row.parentCohortId,
    attributes: (row.attributes as Record<string, unknown>) ?? {},
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSkillAggregate(row: any): SkillAggregate {
  return {
    ...row,
    distribution: row.distribution as Record<MasteryLevel, number>,
    dominantLevel: row.dominantLevel as MasteryLevel | null,
    coverageState: row.coverageState as EvidenceCoverageState,
    trend: row.trend as TrendDirection,
  };
}

function toRoleAggregate(row: any): RoleAggregate {
  return {
    ...row,
    readinessDistribution: row.readinessDistribution as Record<ReadinessState, number>,
    requiredSkillGaps: row.requiredSkillGaps as RoleAggregate['requiredSkillGaps'],
    coverageState: row.coverageState as EvidenceCoverageState,
    trend: row.trend as TrendDirection,
  };
}

function toTrainingInsight(row: any): TrainingInsight {
  return {
    ...row,
    skillId: row.skillId ?? undefined,
    roleId: row.roleId ?? undefined,
    gapPriority: row.gapPriority as GapPriority,
    interventionCategories: row.interventionCategories as InterventionCategory[],
    rationale: row.rationale as string[],
  };
}

function toAuditEntry(row: any): AuditEntry {
  return {
    ...row,
    targetType: row.targetType ?? undefined,
    targetId: row.targetId ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
  };
}

export class PrismaCohortRepository implements CohortRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateCohortInput): Promise<Cohort> {
    const row = await this.prisma.cohortDefinition.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        kind: input.kind as any,
        dimension: input.dimension as any,
        parentCohortId: input.parentCohortId ?? null,
        attributes: (input.attributes ?? {}) as any,
      },
    });
    return toCohort(row);
  }

  async findById(organizationId: string, cohortId: string): Promise<Cohort | null> {
    const row = await this.prisma.cohortDefinition.findFirst({ where: { id: cohortId, organizationId } });
    return row ? toCohort(row) : null;
  }

  async list(organizationId: string, filter?: CohortFilter): Promise<Cohort[]> {
    const rows = await this.prisma.cohortDefinition.findMany({
      where: {
        organizationId,
        kind: filter?.kind as any,
        isActive: filter?.isActive,
        parentCohortId: filter?.parentCohortId,
      },
    });
    return rows.map(toCohort);
  }

  async update(
    organizationId: string,
    cohortId: string,
    patch: Partial<Pick<Cohort, 'name' | 'attributes' | 'isActive'>>
  ): Promise<Cohort> {
    const existing = await this.findById(organizationId, cohortId);
    if (!existing) throw new NotFoundError('Cohort not found.');
    const row = await this.prisma.cohortDefinition.update({
      where: { id: cohortId },
      data: { name: patch.name, attributes: patch.attributes as any, isActive: patch.isActive },
    });
    return toCohort(row);
  }
}

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async add(organizationId: string, cohortId: string, studentId: string): Promise<Membership> {
    const existing = await this.prisma.cohortMembership.findUnique({
      where: { cohortId_studentId: { cohortId, studentId } },
    });
    if (existing?.isActive) throw new ConflictError('Student is already an active member of this cohort.');

    const row = existing
      ? await this.prisma.cohortMembership.update({
          where: { id: existing.id },
          data: { isActive: true, leftAt: null, joinedAt: new Date() },
        })
      : await this.prisma.cohortMembership.create({ data: { organizationId, cohortId, studentId } });

    return row;
  }

  async remove(organizationId: string, cohortId: string, studentId: string): Promise<void> {
    await this.prisma.cohortMembership.updateMany({
      where: { organizationId, cohortId, studentId, isActive: true },
      data: { isActive: false, leftAt: new Date() },
    });
  }

  async listStudentIds(organizationId: string, cohortId: string): Promise<string[]> {
    const rows = await this.prisma.cohortMembership.findMany({
      where: { organizationId, cohortId, isActive: true },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  async listCohortIdsForStudent(organizationId: string, studentId: string): Promise<string[]> {
    const rows = await this.prisma.cohortMembership.findMany({
      where: { organizationId, studentId, isActive: true },
      select: { cohortId: true },
    });
    return rows.map((r) => r.cohortId);
  }

  async count(organizationId: string, cohortId: string): Promise<number> {
    return this.prisma.cohortMembership.count({ where: { organizationId, cohortId, isActive: true } });
  }
}

export class PrismaSkillAggregateRepository implements SkillAggregateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertMany(aggregates: Omit<SkillAggregate, 'id'>[]): Promise<SkillAggregate[]> {
    const created = await this.prisma.$transaction(
      aggregates.map((a) =>
        this.prisma.cohortSkillAggregate.create({
          data: {
            organizationId: a.organizationId,
            cohortId: a.cohortId,
            skillId: a.skillId,
            skillName: a.skillName,
            eligibleStudents: a.eligibleStudents,
            studentsWithEvidence: a.studentsWithEvidence,
            coveragePct: a.coveragePct,
            coverageState: a.coverageState as any,
            distribution: a.distribution as any,
            dominantLevel: a.dominantLevel as any,
            trend: a.trend as any,
            confidence: a.confidence,
            sourceVersion: a.sourceVersion,
            computedAt: a.computedAt,
          },
        })
      )
    );
    return created.map(toSkillAggregate);
  }

  async listLatestForCohort(organizationId: string, cohortId: string): Promise<SkillAggregate[]> {
    const rows = await this.prisma.cohortSkillAggregate.findMany({
      where: { organizationId, cohortId },
      orderBy: { computedAt: 'desc' },
    });
    const latestBySkill = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!latestBySkill.has(row.skillId)) latestBySkill.set(row.skillId, row);
    return [...latestBySkill.values()].map(toSkillAggregate);
  }

  async listHistoryForSkill(
    organizationId: string,
    cohortId: string,
    skillId: string,
    limit = 12
  ): Promise<SkillAggregate[]> {
    const rows = await this.prisma.cohortSkillAggregate.findMany({
      where: { organizationId, cohortId, skillId },
      orderBy: { computedAt: 'desc' },
      take: limit,
    });
    return rows.map(toSkillAggregate);
  }
}

export class PrismaRoleAggregateRepository implements RoleAggregateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertMany(aggregates: Omit<RoleAggregate, 'id'>[]): Promise<RoleAggregate[]> {
    const created = await this.prisma.$transaction(
      aggregates.map((a) =>
        this.prisma.cohortRoleAggregate.create({
          data: {
            organizationId: a.organizationId,
            cohortId: a.cohortId,
            roleId: a.roleId,
            roleName: a.roleName,
            eligibleStudents: a.eligibleStudents,
            studentsWithEvidence: a.studentsWithEvidence,
            coveragePct: a.coveragePct,
            coverageState: a.coverageState as any,
            readinessDistribution: a.readinessDistribution as any,
            requiredSkillGaps: a.requiredSkillGaps as any,
            trend: a.trend as any,
            confidence: a.confidence,
            sourceVersion: a.sourceVersion,
            computedAt: a.computedAt,
          },
        })
      )
    );
    return created.map(toRoleAggregate);
  }

  async listLatestForCohort(organizationId: string, cohortId: string): Promise<RoleAggregate[]> {
    const rows = await this.prisma.cohortRoleAggregate.findMany({
      where: { organizationId, cohortId },
      orderBy: { computedAt: 'desc' },
    });
    const latestByRole = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!latestByRole.has(row.roleId)) latestByRole.set(row.roleId, row);
    return [...latestByRole.values()].map(toRoleAggregate);
  }
}

export class PrismaTrainingInsightRepository implements TrainingInsightRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async replaceForCohort(
    organizationId: string,
    cohortId: string,
    insights: Omit<TrainingInsight, 'id'>[]
  ): Promise<TrainingInsight[]> {
    await this.prisma.cohortTrainingInsight.deleteMany({ where: { organizationId, cohortId } });
    const created = await this.prisma.$transaction(
      insights.map((i) =>
        this.prisma.cohortTrainingInsight.create({
          data: {
            organizationId: i.organizationId,
            cohortId: i.cohortId,
            skillId: i.skillId,
            roleId: i.roleId,
            label: i.label,
            gapPriority: i.gapPriority as any,
            interventionCategories: i.interventionCategories as any,
            affectedStudents: i.affectedStudents,
            rationale: i.rationale as any,
            priorityRank: i.priorityRank,
            sourceVersion: i.sourceVersion,
            computedAt: i.computedAt,
          },
        })
      )
    );
    return created.map(toTrainingInsight);
  }

  async listForCohort(organizationId: string, cohortId: string): Promise<TrainingInsight[]> {
    const rows = await this.prisma.cohortTrainingInsight.findMany({
      where: { organizationId, cohortId },
      orderBy: { priorityRank: 'asc' },
    });
    return rows.map(toTrainingInsight);
  }
}

export class PrismaSnapshotRepository implements SnapshotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(snapshot: Omit<CohortSnapshotRecord, 'id' | 'createdAt'>): Promise<CohortSnapshotRecord> {
    try {
      return await this.prisma.cohortSnapshot.create({
        data: {
          organizationId: snapshot.organizationId,
          cohortId: snapshot.cohortId,
          periodLabel: snapshot.periodLabel,
          periodStart: snapshot.periodStart,
          periodEnd: snapshot.periodEnd,
          payload: snapshot.payload as any,
          scoringMethodologyVersion: snapshot.scoringMethodologyVersion,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictError('A snapshot for this period already exists.');
      throw err;
    }
  }

  async list(organizationId: string, cohortId: string, limit = 24): Promise<CohortSnapshotRecord[]> {
    return this.prisma.cohortSnapshot.findMany({
      where: { organizationId, cohortId },
      orderBy: { periodStart: 'desc' },
      take: limit,
    });
  }

  async findByPeriod(organizationId: string, cohortId: string, periodLabel: string): Promise<CohortSnapshotRecord | null> {
    return this.prisma.cohortSnapshot.findFirst({ where: { organizationId, cohortId, periodLabel } });
  }
}

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<AuditEntry> {
    const row = await this.prisma.auditLogEntry.create({
      data: {
        organizationId: entry.organizationId,
        actorUserId: entry.actorUserId,
        actorRole: entry.actorRole,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata as any,
      },
    });
    return toAuditEntry(row);
  }

  async list(organizationId: string, limit = 100): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditLogEntry.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toAuditEntry);
  }
}

export class PrismaPrivacyPolicyRepository implements PrivacyPolicyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(organizationId: string): Promise<PrivacyPolicyRecord> {
    const row = await this.prisma.organizationPrivacyPolicy.findUnique({ where: { organizationId } });
    return (
      row ?? {
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
    const merged = { ...current, ...patch };
    return this.prisma.organizationPrivacyPolicy.upsert({
      where: { organizationId },
      create: { organizationId, minCohortSize: merged.minCohortSize, minCoverageForClaim: merged.minCoverageForClaim },
      update: { minCohortSize: merged.minCohortSize, minCoverageForClaim: merged.minCoverageForClaim },
    });
  }
}

export class PrismaEventRepository implements EventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordIfNew(event: Omit<EventRecord, 'id' | 'status' | 'processedAt'>): Promise<EventRecord | null> {
    try {
      const row = await this.prisma.cohortIntelligenceEvent.create({
        data: {
          organizationId: event.organizationId,
          studentId: event.studentId,
          cohortId: event.cohortId,
          eventType: event.eventType as any,
          sourceEventId: event.sourceEventId,
          sourceTimestamp: event.sourceTimestamp,
          payload: event.payload as any,
        },
      });
      return { ...row, status: row.status as EventRecord['status'] };
    } catch (err: any) {
      if (err?.code === 'P2002') return null; // duplicate sourceEventId — idempotent no-op
      throw err;
    }
  }

  async markProcessed(id: string): Promise<void> {
    await this.prisma.cohortIntelligenceEvent.update({
      where: { id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
  }

  async markFailed(id: string, reason: string): Promise<void> {
    await this.prisma.cohortIntelligenceEvent.update({ where: { id }, data: { status: 'FAILED', failureReason: reason } });
  }
}

export function createPrismaRepositories(prisma: PrismaClient): Repositories {
  return {
    cohorts: new PrismaCohortRepository(prisma),
    memberships: new PrismaMembershipRepository(prisma),
    skillAggregates: new PrismaSkillAggregateRepository(prisma),
    roleAggregates: new PrismaRoleAggregateRepository(prisma),
    trainingInsights: new PrismaTrainingInsightRepository(prisma),
    snapshots: new PrismaSnapshotRepository(prisma),
    audit: new PrismaAuditRepository(prisma),
    privacyPolicy: new PrismaPrivacyPolicyRepository(prisma),
    events: new PrismaEventRepository(prisma),
  };
}
