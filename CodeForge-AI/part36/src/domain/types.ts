import type {
  CohortKind,
  CohortDimension,
  MasteryLevel,
  EvidenceCoverageState,
  TrendDirection,
  ReadinessState,
  GapPriority,
  InterventionCategory,
  Role,
  FreshnessState,
} from './enums';

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: Role;
}

export interface Cohort {
  id: string;
  organizationId: string;
  name: string;
  kind: CohortKind;
  dimension: CohortDimension;
  parentCohortId: string | null;
  attributes: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Membership {
  id: string;
  organizationId: string;
  cohortId: string;
  studentId: string;
  joinedAt: Date;
  leftAt: Date | null;
  isActive: boolean;
}

export interface SkillAggregate {
  id: string;
  organizationId: string;
  cohortId: string;
  skillId: string;
  skillName: string;
  eligibleStudents: number;
  studentsWithEvidence: number;
  coveragePct: number;
  coverageState: EvidenceCoverageState;
  distribution: Record<MasteryLevel, number>;
  dominantLevel: MasteryLevel | null;
  trend: TrendDirection;
  confidence: number;
  sourceVersion: string;
  computedAt: Date;
}

export interface RequiredSkillGap {
  skillId: string;
  skillName: string;
  gapPriority: GapPriority;
}

export interface RoleAggregate {
  id: string;
  organizationId: string;
  cohortId: string;
  roleId: string;
  roleName: string;
  eligibleStudents: number;
  studentsWithEvidence: number;
  coveragePct: number;
  coverageState: EvidenceCoverageState;
  readinessDistribution: Record<ReadinessState, number>;
  requiredSkillGaps: RequiredSkillGap[];
  trend: TrendDirection;
  confidence: number;
  sourceVersion: string;
  computedAt: Date;
}

export interface TrainingInsight {
  id: string;
  organizationId: string;
  cohortId: string;
  skillId?: string;
  roleId?: string;
  label: string;
  gapPriority: GapPriority;
  interventionCategories: InterventionCategory[];
  affectedStudents: number;
  rationale: string[];
  priorityRank: number;
  sourceVersion: string;
  computedAt: Date;
}

export interface CohortSnapshotRecord {
  id: string;
  organizationId: string;
  cohortId: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  payload: unknown;
  scoringMethodologyVersion: string;
  createdAt: Date;
}

export interface AuditEntry {
  id: string;
  organizationId: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface PrivacyPolicyRecord {
  organizationId: string;
  minCohortSize: number;
  minCoverageForClaim: number;
}

export interface FreshnessInfo {
  state: FreshnessState;
  lastUpdated: Date | null;
  dataWindow?: string;
}

export interface CohortExecutiveOverview {
  cohort: Pick<Cohort, 'id' | 'name' | 'kind'>;
  freshness: FreshnessInfo;
  strongestAreas: string[];
  priorityGaps: string[];
  highestImpactRoleGap: string | null;
  trainingPriorities: string[];
  evidenceCoverageSummary: Record<string, EvidenceCoverageState>;
  observedGrowth: string[];
  restricted?: { reason: string };
}
