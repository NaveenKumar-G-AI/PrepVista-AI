import { boolean, index, integer, pgEnum, pgTable, real, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Feature 37 — Career Readiness Proof Engine: database schema.
 * -----------------------------------------------------------------------
 * IMPORTANT — read before running a migration against a real ACEAPT database:
 *
 * This schema defines ONLY the structures Feature 37 needs that don't
 * already exist elsewhere. `studentId` / `tenantId` columns below are plain
 * text on purpose, NOT foreign keys to new Student/Tenant tables — Feature
 * 37 assumes your existing Student/Tenant tables already exist. Before a
 * real migration:
 *
 *   1. If ACEAPT already has a skills/capabilities taxonomy, do NOT create
 *      a second one — drop `capabilities` here and point
 *      `roleCapabilityRequirements.capabilityId` / `evidenceItems.capabilityId`
 *      at your existing table instead.
 *   2. If Feature 34 already owns "target role", do the same with
 *      `roleProfiles` (see integrations/types.ts -> TrajectoryProvider).
 *   3. Turn the plain `studentId` / `tenantId` text columns into real
 *      foreign keys against your existing tables.
 *
 * Everything under `src/engine/` is plain TypeScript with zero dependency
 * on this schema or on Drizzle — it operates purely on the DTOs in
 * `src/types/domain.ts`. Whatever you rename or merge here, the engine and
 * its tests are unaffected; only `src/repositories` needs to change.
 * -----------------------------------------------------------------------
 */

export const evidenceSourceTypeEnum = pgEnum('evidence_source_type', [
  'SELF_REPORT',
  'TRAINING',
  'CERTIFICATE',
  'ASSESSMENT',
  'CODING_TEST',
  'PROJECT',
  'SIMULATION',
  'MOCK_INTERVIEW',
  'INTERVIEW',
  'RESUME',
  'PORTFOLIO',
  'OPPORTUNITY_OUTCOME',
]);

export const validationStateEnum = pgEnum('validation_state', ['UNVALIDATED', 'SELF_ASSERTED', 'VALIDATED', 'DISPUTED']);

export const requiredLevelEnum = pgEnum('required_level', ['BASIC', 'INTERMEDIATE', 'STRONG']);

export const readinessStateEnum = pgEnum('readiness_state', [
  'UNKNOWN',
  'EXPLORING',
  'BUILDING',
  'DEVELOPING',
  'VALIDATING',
  'READY_TO_TEST',
  'STRONG_EVIDENCE',
]);

/** A canonical capability/skill (e.g. "Python", "SQL", "System Design"). */
export const capabilities = pgTable(
  'capabilities',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    /** Default decay window in days before evidence is considered stale. See engine/freshness.ts. */
    freshnessWindowDays: integer('freshness_window_days').notNull().default(210),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantNameUnique: uniqueIndex('capabilities_tenant_name_unique').on(table.tenantId, table.name),
    tenantIdx: index('capabilities_tenant_idx').on(table.tenantId),
  })
);

/** A target role a student can be evaluated against (e.g. "Backend Developer"). */
export const roleProfiles = pgTable(
  'role_profiles',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantNameUnique: uniqueIndex('role_profiles_tenant_name_unique').on(table.tenantId, table.name),
  })
);

export const roleCapabilityRequirements = pgTable(
  'role_capability_requirements',
  {
    id: text('id').primaryKey(),
    roleId: text('role_id')
      .notNull()
      .references(() => roleProfiles.id, { onDelete: 'cascade' }),
    capabilityId: text('capability_id')
      .notNull()
      .references(() => capabilities.id),
    requiredLevel: requiredLevelEnum('required_level').notNull(),
    /** 1 = nice-to-have, 2 = secondary, 3 = core/must-have. */
    importance: integer('importance').notNull().default(2),
  },
  (table) => ({
    roleCapUnique: uniqueIndex('role_cap_req_unique').on(table.roleId, table.capabilityId),
    roleIdx: index('role_cap_req_role_idx').on(table.roleId),
  })
);

/** Which role(s) a student currently targets. Replace with a Feature-34-backed adapter if that already exists. */
export const studentRoleTargets = pgTable(
  'student_role_targets',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    roleId: text('role_id')
      .notNull()
      .references(() => roleProfiles.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    studentRoleUnique: uniqueIndex('student_role_targets_unique').on(table.studentId, table.roleId),
    studentIdx: index('student_role_targets_student_idx').on(table.studentId),
  })
);

/** A specific opportunity/job. Replace with a Feature-33-backed requirement lookup if that already exists. */
export const opportunities = pgTable('opportunities', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  title: text('title').notNull(),
  /** Id of the real opportunity record in Feature 33, once wired up. */
  externalRefId: text('external_ref_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opportunityCapabilityRequirements = pgTable(
  'opportunity_capability_requirements',
  {
    id: text('id').primaryKey(),
    opportunityId: text('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    capabilityId: text('capability_id')
      .notNull()
      .references(() => capabilities.id),
    requiredLevel: requiredLevelEnum('required_level').notNull(),
    importance: integer('importance').notNull().default(2),
  },
  (table) => ({
    oppCapUnique: uniqueIndex('opp_cap_req_unique').on(table.opportunityId, table.capabilityId),
  })
);

/** The only thing the engine is ever allowed to reason from. Every write path should insert here. */
export const evidenceItems = pgTable(
  'evidence_items',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    capabilityId: text('capability_id')
      .notNull()
      .references(() => capabilities.id),
    sourceType: evidenceSourceTypeEnum('source_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    score: real('score'),
    /** PASSED | FAILED | STRONG | WEAK | COMPLETED — free-form so new outcomes don't need a migration. */
    outcome: text('outcome'),
    context: text('context'),
    validationState: validationStateEnum('validation_state').notNull().default('UNVALIDATED'),
    claimedLevel: requiredLevelEnum('claimed_level'),
    /** Id of the record in the originating system, for traceability back to the source of truth. */
    externalRefId: text('external_ref_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    studentCapIdx: index('evidence_items_student_cap_idx').on(table.studentId, table.capabilityId),
    tenantIdx: index('evidence_items_tenant_idx').on(table.tenantId),
    studentOccurredIdx: index('evidence_items_student_occurred_idx').on(table.studentId, table.occurredAt),
  })
);

/** A point-in-time readiness computation — cheap reads + real history for the readiness journey timeline. */
export const readinessSnapshots = pgTable(
  'readiness_snapshots',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    roleId: text('role_id').notNull(),
    state: readinessStateEnum('state').notNull(),
    confidence: text('confidence').notNull(),
    topGapCapabilityId: text('top_gap_capability_id'),
    reasonSummary: text('reason_summary').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    studentRoleCreatedIdx: index('readiness_snapshots_student_role_created_idx').on(table.studentId, table.roleId, table.createdAt),
  })
);

/** Every readiness state transition, with a human-readable reason. Required for explainability and audit. */
export const readinessAuditLogs = pgTable(
  'readiness_audit_logs',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    roleId: text('role_id').notNull(),
    fromState: text('from_state'),
    toState: text('to_state').notNull(),
    reason: text('reason').notNull(),
    /** e.g. "evidence:<evidenceItemId>" or "recalculation". */
    triggeredBy: text('triggered_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idx: index('readiness_audit_logs_idx').on(table.studentId, table.roleId, table.createdAt),
  })
);
