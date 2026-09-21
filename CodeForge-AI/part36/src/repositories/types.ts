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
import type { CohortKind, CohortDimension } from '../domain/enums';

export interface CreateCohortInput {
  organizationId: string;
  name: string;
  kind: CohortKind;
  dimension: CohortDimension;
  parentCohortId?: string | null;
  attributes?: Record<string, unknown>;
}

export interface CohortFilter {
  kind?: CohortKind;
  isActive?: boolean;
  parentCohortId?: string | null;
}

export interface CohortRepository {
  create(input: CreateCohortInput): Promise<Cohort>;
  findById(organizationId: string, cohortId: string): Promise<Cohort | null>;
  list(organizationId: string, filter?: CohortFilter): Promise<Cohort[]>;
  update(
    organizationId: string,
    cohortId: string,
    patch: Partial<Pick<Cohort, 'name' | 'attributes' | 'isActive'>>
  ): Promise<Cohort>;
}

export interface MembershipRepository {
  add(organizationId: string, cohortId: string, studentId: string): Promise<Membership>;
  remove(organizationId: string, cohortId: string, studentId: string): Promise<void>;
  listStudentIds(organizationId: string, cohortId: string): Promise<string[]>;
  /** Reverse lookup used by the event-driven aggregation path so only
   * cohorts a student actually belongs to get recomputed (section 36),
   * instead of scanning every cohort in the institution. */
  listCohortIdsForStudent(organizationId: string, studentId: string): Promise<string[]>;
  count(organizationId: string, cohortId: string): Promise<number>;
}

export interface SkillAggregateRepository {
  upsertMany(aggregates: Omit<SkillAggregate, 'id'>[]): Promise<SkillAggregate[]>;
  listLatestForCohort(organizationId: string, cohortId: string): Promise<SkillAggregate[]>;
  listHistoryForSkill(organizationId: string, cohortId: string, skillId: string, limit?: number): Promise<SkillAggregate[]>;
}

export interface RoleAggregateRepository {
  upsertMany(aggregates: Omit<RoleAggregate, 'id'>[]): Promise<RoleAggregate[]>;
  listLatestForCohort(organizationId: string, cohortId: string): Promise<RoleAggregate[]>;
}

export interface TrainingInsightRepository {
  replaceForCohort(
    organizationId: string,
    cohortId: string,
    insights: Omit<TrainingInsight, 'id'>[]
  ): Promise<TrainingInsight[]>;
  listForCohort(organizationId: string, cohortId: string): Promise<TrainingInsight[]>;
}

export interface SnapshotRepository {
  create(snapshot: Omit<CohortSnapshotRecord, 'id' | 'createdAt'>): Promise<CohortSnapshotRecord>;
  list(organizationId: string, cohortId: string, limit?: number): Promise<CohortSnapshotRecord[]>;
  findByPeriod(organizationId: string, cohortId: string, periodLabel: string): Promise<CohortSnapshotRecord | null>;
}

export interface AuditRepository {
  record(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<AuditEntry>;
  list(organizationId: string, limit?: number): Promise<AuditEntry[]>;
}

export interface PrivacyPolicyRepository {
  get(organizationId: string): Promise<PrivacyPolicyRecord>;
  set(organizationId: string, patch: Partial<Omit<PrivacyPolicyRecord, 'organizationId'>>): Promise<PrivacyPolicyRecord>;
}

export interface EventRecord {
  id: string;
  organizationId: string;
  studentId: string;
  cohortId: string | null;
  eventType: string;
  sourceEventId: string;
  sourceTimestamp: Date;
  payload: unknown;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  processedAt: Date | null;
}

export interface EventRepository {
  /** Returns null if sourceEventId was already recorded — the
   * idempotency guarantee behind golden scenario #76. */
  recordIfNew(event: Omit<EventRecord, 'id' | 'status' | 'processedAt'>): Promise<EventRecord | null>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
}

export interface Repositories {
  cohorts: CohortRepository;
  memberships: MembershipRepository;
  skillAggregates: SkillAggregateRepository;
  roleAggregates: RoleAggregateRepository;
  trainingInsights: TrainingInsightRepository;
  snapshots: SnapshotRepository;
  audit: AuditRepository;
  privacyPolicy: PrivacyPolicyRepository;
  events: EventRepository;
}
