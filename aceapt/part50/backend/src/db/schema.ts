// Drizzle schema for Feature 50 (spec section 82-85).
//
// student_id / question_id are plain uuid columns without a hard FK
// constraint to `students` / `questions`, since those tables live in the
// core ACEAPT schema that wasn't available to inspect here. Add the FK
// constraints (commented below each column) once merged into the real DB.

import { boolean, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const speedSessions = pgTable('speed_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull(), // REFERENCES students(id)
  mode: varchar('mode', { length: 32 }).notNull(),
  pressureLevel: varchar('pressure_level', { length: 32 }).notNull().default('SOFT_TIMER'),
  state: varchar('state', { length: 24 }).notNull().default('READY'),
  scopeType: varchar('scope_type', { length: 24 }).notNull(),
  scopeId: varchar('scope_id', { length: 128 }).notNull(),
  targetTimeMs: integer('target_time_ms'),
  guardrailAccuracy: real('guardrail_accuracy').notNull().default(0.85),
  goalId: uuid('goal_id'), // REFERENCES goals(id) - Feature 44, nullable
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const speedAttempts = pgTable(
  'speed_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => speedSessions.id),
    studentId: uuid('student_id').notNull(), // REFERENCES students(id)
    questionId: uuid('question_id').notNull(), // REFERENCES questions(id)
    skillId: varchar('skill_id', { length: 128 }).notNull(),
    subskillId: varchar('subskill_id', { length: 128 }),
    domain: varchar('domain', { length: 128 }),
    topic: varchar('topic', { length: 128 }),
    difficulty: varchar('difficulty', { length: 16 }).notNull(),
    questionType: varchar('question_type', { length: 48 }),
    responseTimeMs: integer('response_time_ms').notNull(),
    correct: boolean('correct').notNull(),
    independent: boolean('independent').notNull().default(true),
    hintLevel: integer('hint_level').notNull().default(0),
    noveltyLevel: varchar('novelty_level', { length: 16 }),
    stageReadingMs: integer('stage_reading_ms'),
    stageStrategyMs: integer('stage_strategy_ms'),
    stageCalculationMs: integer('stage_calculation_ms'),
    stageVerificationMs: integer('stage_verification_ms'),
    decision: varchar('decision', { length: 16 }),
    retryCount: integer('retry_count'),
    idleMs: integer('idle_ms'),
    confidenceRating: integer('confidence_rating'),
    expectedTimeMs: integer('expected_time_ms'),
    expectedTimeSource: varchar('expected_time_source', { length: 24 }),
    relativeSpeed: real('relative_speed'),
    performanceState: varchar('performance_state', { length: 24 }),
    clientAttemptId: varchar('client_attempt_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idempotency: uniqueIndex('speed_attempts_session_client_idx').on(table.sessionId, table.clientAttemptId),
  }),
);

export const speedProfiles = pgTable(
  'speed_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id').notNull(),
    scopeType: varchar('scope_type', { length: 24 }).notNull(),
    scopeId: varchar('scope_id', { length: 128 }).notNull(),
    averageTimeMs: integer('average_time_ms').notNull(),
    medianTimeMs: integer('median_time_ms').notNull(),
    accuracy: real('accuracy').notNull(),
    expectedTimeMs: integer('expected_time_ms'),
    expectedTimeSource: varchar('expected_time_source', { length: 24 }),
    relativeSpeed: real('relative_speed'),
    sampleSize: integer('sample_size').notNull(),
    confidence: varchar('confidence', { length: 12 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    scopeIdx: uniqueIndex('speed_profiles_student_scope_idx').on(table.studentId, table.scopeType, table.scopeId),
  }),
);

export const speedBottlenecks = pgTable('speed_bottlenecks', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull(),
  scopeType: varchar('scope_type', { length: 24 }).notNull(),
  scopeId: varchar('scope_id', { length: 128 }),
  type: varchar('type', { length: 24 }).notNull(),
  evidence: text('evidence').notNull(),
  metrics: jsonb('metrics'),
  confidence: varchar('confidence', { length: 12 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
});

export const speedTargets = pgTable(
  'speed_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id').notNull(),
    scopeType: varchar('scope_type', { length: 24 }).notNull(),
    scopeId: varchar('scope_id', { length: 128 }).notNull(),
    currentTargetMs: integer('current_target_ms').notNull(),
    baselineMs: integer('baseline_ms').notNull(),
    guardrailAccuracy: real('guardrail_accuracy').notNull(),
    lastRampedAt: timestamp('last_ramped_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    scopeIdx: uniqueIndex('speed_targets_student_scope_idx').on(table.studentId, table.scopeType, table.scopeId),
  }),
);

export const pacingSessions = pgTable('pacing_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull(),
  speedSessionId: uuid('speed_session_id').references(() => speedSessions.id),
  mode: varchar('mode', { length: 24 }).notNull(), // PACING | PLACEMENT_SIMULATION
  totalQuestions: integer('total_questions').notNull(),
  timeBudgetMs: integer('time_budget_ms').notNull(),
  timeElapsedMs: integer('time_elapsed_ms').notNull().default(0),
  questionsCompleted: integer('questions_completed').notNull().default(0),
  correctCount: integer('correct_count').notNull().default(0),
  state: varchar('state', { length: 24 }).notNull().default('READY'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
