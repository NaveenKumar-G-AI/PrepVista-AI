// ACEAPT — Feature 45: Aptitude Skill Graph
// Reference relational implementation.
//
// Per spec section 64, a graph database is NOT introduced by default — the
// graph is modeled relationally (skills + typed edges), which is sufficient
// at curriculum scale (tens to low thousands of nodes). Revisit only if real
// traversal depth/fan-out numbers justify it (section 63).
//
// Dialect note: this uses drizzle-orm's SQLite dialect for a zero-dependency
// dev/test story (better-sqlite3, no external DB server, no network calls).
// To move to Postgres, swap the `drizzle-orm/sqlite-core` imports for
// `drizzle-orm/pg-core` equivalents (sqliteTable -> pgTable, integer(...,
// {mode:'timestamp'}) -> timestamp(...), integer(...,{mode:'boolean'}) ->
// boolean(...)) and point src/db/client.ts at a pg driver. Column names,
// indexes, and every service/repository built on top are unaffected. See
// service/README.md "Moving to Postgres".
//
// NOTE ON ENUM-LIKE COLUMNS: values (domain, level, relationshipType,
// source, status, state, confidence, trend, eventType) are plain text
// columns validated at the application boundary (src/domain/enums.ts,
// zod schemas), not DB-level enums — this keeps the schema identical across
// SQLite and Postgres and keeps validation logic in one place.

import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Small dependency-free id generator (timestamp + random, monotonic-ish, collision-resistant enough for this reference implementation). */
export function generateId(prefix = 'c'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
};

// ---------------------------------------------------------------------------
// GLOBAL GRAPH LAYER
// ---------------------------------------------------------------------------

/** A named, immutable snapshot boundary for the global graph (spec section 20). */
export const graphVersions = sqliteTable(
  'graph_versions',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId('gv_')),
    versionLabel: text('version_label').notNull().unique(),
    status: text('status').notNull().default('DRAFT'), // DRAFT|REVIEW|VALIDATED|PUBLISHED|ARCHIVED
    effectiveFrom: integer('effective_from', { mode: 'timestamp' }),
    effectiveTo: integer('effective_to', { mode: 'timestamp' }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => ({
    statusIdx: index('graph_versions_status_idx').on(t.status),
  }),
);

/** A node in the global skill graph. `code` is the stable machine identifier (section 14). */
export const skills = sqliteTable(
  'skills',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId('sk_')),
    code: text('code').notNull().unique(), // e.g. "QUANT.PERCENTAGES"
    displayName: text('display_name').notNull(),
    domain: text('domain').notNull(), // QUANTITATIVE_APTITUDE|LOGICAL_REASONING|VERBAL_APTITUDE
    level: text('level').notNull(), // DOMAIN|CATEGORY|SKILL|SUBSKILL|MICRO_CAPABILITY
    description: text('description'),
    status: text('status').notNull().default('DRAFT'),
    parentId: text('parent_id'),
    graphVersionId: text('graph_version_id')
      .notNull()
      .references(() => graphVersions.id),
    ...timestamps,
  },
  (t) => ({
    domainIdx: index('skills_domain_idx').on(t.domain),
    parentIdx: index('skills_parent_idx').on(t.parentId),
    levelIdx: index('skills_level_idx').on(t.level),
    statusIdx: index('skills_status_idx').on(t.status),
  }),
);

/**
 * A directed, typed edge between two skills (sections 15-18). Direction
 * matters: fromSkill -> toSkill for PREREQUISITE/DEPENDS_ON/BUILDS/PART_OF
 * means "fromSkill supports/precedes toSkill". RELATED_TO, TRANSFER_TO and
 * COMMON_ERROR_SOURCE are associative signals, not strict ordering.
 */
export const skillRelationships = sqliteTable(
  'skill_relationships',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId('rel_')),
    fromSkillId: text('from_skill_id')
      .notNull()
      .references(() => skills.id),
    toSkillId: text('to_skill_id')
      .notNull()
      .references(() => skills.id),
    relationshipType: text('relationship_type').notNull(),
    weight: real('weight').notNull().default(1.0),
    confidence: text('confidence').notNull().default('MODERATE'),
    source: text('source').notNull(), // CURRICULUM|EXPERT_AUTHORED|VALIDATED_ASSESSMENT_DATA|EMPIRICAL_DATA|AI_SUGGESTED
    status: text('status').notNull().default('DRAFT'),
    rationale: text('rationale'), // short "why are these connected" text (sections 54, 57)
    graphVersionId: text('graph_version_id')
      .notNull()
      .references(() => graphVersions.id),
    ...timestamps,
  },
  (t) => ({
    uniqueEdge: uniqueIndex('skill_relationships_unique_edge').on(t.fromSkillId, t.toSkillId, t.relationshipType),
    fromIdx: index('skill_relationships_from_idx').on(t.fromSkillId),
    toIdx: index('skill_relationships_to_idx').on(t.toSkillId),
    typeIdx: index('skill_relationships_type_idx').on(t.relationshipType),
    statusIdx: index('skill_relationships_status_idx').on(t.status),
  }),
);

/**
 * Question -> skill tagging with weighted contribution (sections 26-27).
 * `questionId` has no FK here on purpose: it references ACEAPT's real,
 * canonical Question entity, which lives outside this service.
 */
export const questionSkillMappings = sqliteTable(
  'question_skill_mappings',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId('qsm_')),
    questionId: text('question_id').notNull(),
    skillId: text('skill_id')
      .notNull()
      .references(() => skills.id),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    weight: real('weight').notNull().default(1.0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    questionIdx: index('qsm_question_idx').on(t.questionId),
    skillIdx: index('qsm_skill_idx').on(t.skillId),
  }),
);

// ---------------------------------------------------------------------------
// PERSONAL GRAPH LAYER (global graph + student evidence, section 8)
// ---------------------------------------------------------------------------

/**
 * Materialized, cached per-student-per-skill state (sections 22-25). This is
 * a *projection* recomputed from skillEvidenceEvents by
 * StudentSkillStateService — never hand-edited, never fabricated when
 * evidenceCount is 0 (capability stays null, state stays UNKNOWN).
 * `studentId` references ACEAPT's canonical Student entity (external).
 */
export const studentSkillStates = sqliteTable(
  'student_skill_states',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId('sss_')),
    studentId: text('student_id').notNull(),
    skillId: text('skill_id')
      .notNull()
      .references(() => skills.id),
    capability: real('capability'), // 0-100, NULL = UNKNOWN — never a fabricated number
    state: text('state').notNull().default('UNKNOWN'), // UNKNOWN|DEVELOPING|STRONG|MASTERED|MAINTENANCE
    trend: text('trend'), // IMPROVING|DECLINING|STABLE
    evidenceCount: integer('evidence_count').notNull().default(0),
    confidence: text('confidence').notNull().default('NONE'), // NONE|LOW|MODERATE|HIGH
    lastEvaluatedAt: integer('last_evaluated_at', { mode: 'timestamp' }),
    // Pointers into the *real* systems once those adapters are live instead
    // of stubbed (sections 39-40) — unused on the stub path.
    masterySourceRef: text('mastery_source_ref'),
    retentionSourceRef: text('retention_source_ref'),
    ...timestamps,
  },
  (t) => ({
    uniqueStudentSkill: uniqueIndex('sss_unique_student_skill').on(t.studentId, t.skillId),
    studentIdx: index('sss_student_idx').on(t.studentId),
    skillIdx: index('sss_skill_idx').on(t.skillId),
    stateIdx: index('sss_state_idx').on(t.state),
  }),
);

/**
 * Append-only evidence log (section 24). This is the source of truth;
 * studentSkillStates is a cache derived from it. Never invented — every row
 * traces back to a real attempt/mistake/mastery-check/retention-check via
 * `sourceRef`.
 */
export const skillEvidenceEvents = sqliteTable(
  'skill_evidence_events',
  {
    id: text('id').primaryKey().$defaultFn(() => generateId('evt_')),
    studentId: text('student_id').notNull(),
    skillId: text('skill_id')
      .notNull()
      .references(() => skills.id),
    eventType: text('event_type').notNull(), // DIAGNOSTIC|PRACTICE|ASSESSMENT|MISTAKE|MASTERY_CHECK|RETENTION_CHECK
    isCorrect: integer('is_correct', { mode: 'boolean' }),
    weight: real('weight').notNull().default(1.0),
    sourceRef: text('source_ref'), // id of the attempt/mistake/etc. in the owning system
    occurredAt: integer('occurred_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    studentSkillIdx: index('see_student_skill_idx').on(t.studentId, t.skillId),
    eventTypeIdx: index('see_event_type_idx').on(t.eventType),
  }),
);

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type SkillRelationshipRow = typeof skillRelationships.$inferSelect;
export type NewSkillRelationship = typeof skillRelationships.$inferInsert;
export type GraphVersionRow = typeof graphVersions.$inferSelect;
export type StudentSkillStateRow = typeof studentSkillStates.$inferSelect;
export type NewStudentSkillState = typeof studentSkillStates.$inferInsert;
export type SkillEvidenceEventRow = typeof skillEvidenceEvents.$inferSelect;
export type NewSkillEvidenceEvent = typeof skillEvidenceEvents.$inferInsert;
export type QuestionSkillMappingRow = typeof questionSkillMappings.$inferSelect;
