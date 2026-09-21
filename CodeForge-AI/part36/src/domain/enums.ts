// Enums that are persisted (used as Prisma column types) are defined
// ONCE in prisma/schema.prisma and re-exported here so the rest of the
// app — services, core algorithms, API layer, and even the in-memory
// repositories — imports a single canonical source, regardless of
// which repository backend (memory or Postgres) is active. Prisma's
// generated enums are plain values usable without a live DB
// connection, so this re-export works in memory mode too.
export {
  CohortKind,
  CohortDimension,
  MasteryLevel,
  EvidenceCoverageState,
  TrendDirection,
  ReadinessState,
  GapPriority,
  IntelligenceEventType,
  IntelligenceEventStatus,
} from '@prisma/client';

/**
 * Auth roles are NOT persisted by this service (users live in
 * CodeForge's existing identity system — see IdentityPort), so this
 * enum has no Prisma counterpart.
 *
 * Section 5: TPO, Trainer, Department/Program Admin, Organization
 * Admin, and Student. Students see their own individual intelligence
 * (an existing, different feature) — never unrestricted cohort
 * intelligence — so STUDENT is intentionally excluded from every
 * Feature 36 authorization check.
 */
export enum Role {
  ORG_ADMIN = 'ORG_ADMIN',
  DEPARTMENT_ADMIN = 'DEPARTMENT_ADMIN',
  TPO = 'TPO',
  TRAINER = 'TRAINER',
  STUDENT = 'STUDENT',
}

/** Section 21 — intervention categories are a dashboard-facing
 * classification, not stored on their own; they ride along inside
 * CohortTrainingInsight.interventionCategories as JSON. */
export enum InterventionCategory {
  NEEDS_FOUNDATION_SUPPORT = 'NEEDS_FOUNDATION_SUPPORT',
  NEEDS_PRACTICE = 'NEEDS_PRACTICE',
  NEEDS_ADVANCED_CHALLENGES = 'NEEDS_ADVANCED_CHALLENGES',
  NEEDS_INTERVIEW_VERIFICATION = 'NEEDS_INTERVIEW_VERIFICATION',
  NEEDS_ROLE_SPECIFIC_PREPARATION = 'NEEDS_ROLE_SPECIFIC_PREPARATION',
}

/** Section 34/63 — computed on the fly from computedAt timestamps,
 * never stored. */
export enum FreshnessState {
  UPDATED_RECENTLY = 'UPDATED_RECENTLY',
  UPDATING = 'UPDATING',
  TEMPORARILY_UNAVAILABLE = 'TEMPORARILY_UNAVAILABLE',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
}
