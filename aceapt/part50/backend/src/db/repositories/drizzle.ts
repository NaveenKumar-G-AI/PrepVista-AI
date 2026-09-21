// Postgres-backed implementation of SpeedRepository via Drizzle ORM.
//
// NOTE: this file type-checks against drizzle-orm's real type definitions
// in this environment, but there was no live Postgres instance available
// here to run it against - see IMPLEMENTATION_REPORT.md for details. The
// in-memory implementation (inMemory.ts) is what every automated test in
// /tests exercises.

import { and, desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  Difficulty,
  ExpectedTimeSource,
  EvidenceConfidence,
  PacingSession,
  ScopeKey,
  ScopeType,
  SessionState,
  SpeedAttemptRecord,
  SpeedPerformanceState,
  SpeedSession,
  TrainingMode,
  PressureLevel,
  AttemptDecision,
  BottleneckType,
} from '../../types/domain';
import * as schema from '../schema';
import {
  attemptMatchesScope,
  BottleneckRecord,
  NewAttemptForRepo,
  NewBottleneckRecord,
  NewPacingSessionInput,
  NewSpeedSessionInput,
  SpeedProfileRecord,
  SpeedRepository,
  SpeedSessionPatch,
  SpeedTargetRecord,
} from './types';

type Row = Record<string, unknown>;

function toSession(row: Row): SpeedSession {
  return {
    id: row.id as string,
    studentId: row.studentId as string,
    mode: row.mode as TrainingMode,
    pressureLevel: row.pressureLevel as PressureLevel,
    state: row.state as SessionState,
    scope: { scopeType: row.scopeType as ScopeType, scopeId: row.scopeId as string },
    targetTimeMs: (row.targetTimeMs as number | null) ?? null,
    guardrailAccuracy: row.guardrailAccuracy as number,
    goalId: (row.goalId as string | null) ?? null,
    startedAt: row.startedAt as Date,
    completedAt: (row.completedAt as Date | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

function toAttempt(row: Row): SpeedAttemptRecord {
  return {
    id: row.id as string,
    sessionId: row.sessionId as string,
    studentId: row.studentId as string,
    question: {
      questionId: row.questionId as string,
      skillId: row.skillId as string,
      subskillId: (row.subskillId as string | undefined) ?? undefined,
      domain: (row.domain as string | undefined) ?? undefined,
      topic: (row.topic as string | undefined) ?? undefined,
      difficulty: row.difficulty as Difficulty,
      questionType: (row.questionType as string | undefined) ?? undefined,
    },
    responseTimeMs: row.responseTimeMs as number,
    correct: row.correct as boolean,
    independent: row.independent as boolean,
    hintLevel: row.hintLevel as number,
    noveltyLevel: row.noveltyLevel as SpeedAttemptRecord['noveltyLevel'],
    stage: {
      readingMs: (row.stageReadingMs as number | null) ?? undefined,
      strategyMs: (row.stageStrategyMs as number | null) ?? undefined,
      calculationMs: (row.stageCalculationMs as number | null) ?? undefined,
      verificationMs: (row.stageVerificationMs as number | null) ?? undefined,
    },
    decision: (row.decision as AttemptDecision | null) ?? undefined,
    retryCount: (row.retryCount as number | null) ?? undefined,
    idleMs: (row.idleMs as number | null) ?? undefined,
    confidenceRating: (row.confidenceRating as number | null) ?? undefined,
    clientAttemptId: row.clientAttemptId as string,
    expectedTimeMs: (row.expectedTimeMs as number | null) ?? null,
    expectedTimeSource: (row.expectedTimeSource as ExpectedTimeSource) ?? 'UNKNOWN',
    relativeSpeed: (row.relativeSpeed as number | null) ?? null,
    performanceState: (row.performanceState as SpeedPerformanceState) ?? SpeedPerformanceState.INSUFFICIENT_DATA,
    createdAt: row.createdAt as Date,
  };
}

function toPacingSession(row: Row): PacingSession {
  return {
    id: row.id as string,
    studentId: row.studentId as string,
    speedSessionId: (row.speedSessionId as string | null) ?? null,
    mode: row.mode as PacingSession['mode'],
    totalQuestions: row.totalQuestions as number,
    timeBudgetMs: row.timeBudgetMs as number,
    timeElapsedMs: row.timeElapsedMs as number,
    questionsCompleted: row.questionsCompleted as number,
    correctCount: row.correctCount as number,
    state: row.state as SessionState,
    startedAt: row.startedAt as Date,
    completedAt: (row.completedAt as Date | null) ?? null,
  };
}

export function createDrizzleSpeedRepository(db: NodePgDatabase<typeof schema>): SpeedRepository {
  return {
    async createSession(input: NewSpeedSessionInput) {
      const [row] = await db
        .insert(schema.speedSessions)
        .values({
          studentId: input.studentId,
          mode: input.mode,
          pressureLevel: input.pressureLevel,
          state: input.state,
          scopeType: input.scope.scopeType,
          scopeId: input.scope.scopeId,
          targetTimeMs: input.targetTimeMs,
          guardrailAccuracy: input.guardrailAccuracy,
          goalId: input.goalId ?? null,
        })
        .returning();
      return toSession(row);
    },

    async getSession(id: string) {
      const [row] = await db.select().from(schema.speedSessions).where(eq(schema.speedSessions.id, id));
      return row ? toSession(row) : null;
    },

    async updateSession(id: string, patch: SpeedSessionPatch) {
      const [row] = await db
        .update(schema.speedSessions)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.speedSessions.id, id))
        .returning();
      if (!row) throw new Error('Session not found.');
      return toSession(row);
    },

    async addAttempt(input: NewAttemptForRepo) {
      const inserted = await db
        .insert(schema.speedAttempts)
        .values({
          sessionId: input.sessionId,
          studentId: input.studentId,
          questionId: input.question.questionId,
          skillId: input.question.skillId,
          subskillId: input.question.subskillId,
          domain: input.question.domain,
          topic: input.question.topic,
          difficulty: input.question.difficulty,
          questionType: input.question.questionType,
          responseTimeMs: input.responseTimeMs,
          correct: input.correct,
          independent: input.independent,
          hintLevel: input.hintLevel,
          noveltyLevel: input.noveltyLevel,
          stageReadingMs: input.stage?.readingMs ?? null,
          stageStrategyMs: input.stage?.strategyMs ?? null,
          stageCalculationMs: input.stage?.calculationMs ?? null,
          stageVerificationMs: input.stage?.verificationMs ?? null,
          decision: input.decision,
          retryCount: input.retryCount,
          idleMs: input.idleMs,
          confidenceRating: input.confidenceRating,
          expectedTimeMs: input.expectedTimeMs,
          expectedTimeSource: input.expectedTimeSource,
          relativeSpeed: input.relativeSpeed,
          performanceState: input.performanceState,
          clientAttemptId: input.clientAttemptId,
        })
        .onConflictDoNothing({ target: [schema.speedAttempts.sessionId, schema.speedAttempts.clientAttemptId] })
        .returning();

      if (inserted[0]) return toAttempt(inserted[0]);

      // Conflict happened - a retry/double-submit. Return the original row (spec 143).
      const [existing] = await db
        .select()
        .from(schema.speedAttempts)
        .where(and(eq(schema.speedAttempts.sessionId, input.sessionId), eq(schema.speedAttempts.clientAttemptId, input.clientAttemptId)));
      return toAttempt(existing);
    },

    async listAttemptsBySession(sessionId: string) {
      const rows = await db.select().from(schema.speedAttempts).where(eq(schema.speedAttempts.sessionId, sessionId));
      return rows.map(toAttempt).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },

    async listRecentAttemptsByScope(studentId: string, scope: ScopeKey, limit: number) {
      // Scope filtering beyond student_id is applied in JS to keep this
      // portable across every ScopeType without a large dynamic WHERE
      // builder; for very large tables, add per-scope-type indexed queries.
      const rows = await db
        .select()
        .from(schema.speedAttempts)
        .where(eq(schema.speedAttempts.studentId, studentId))
        .orderBy(desc(schema.speedAttempts.createdAt))
        .limit(limit * 5);
      const attempts = rows.map(toAttempt);
      return attempts
        .filter((a) => attemptMatchesScope(a, scope))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(-limit);
    },

    async upsertProfile(profile: SpeedProfileRecord) {
      await db
        .insert(schema.speedProfiles)
        .values({
          studentId: profile.studentId,
          scopeType: profile.scope.scopeType,
          scopeId: profile.scope.scopeId,
          averageTimeMs: profile.averageMs,
          medianTimeMs: profile.medianMs,
          accuracy: profile.accuracy,
          expectedTimeMs: profile.expectedTimeMs,
          expectedTimeSource: profile.expectedTimeSource,
          relativeSpeed: profile.relativeSpeed,
          sampleSize: profile.sampleSize,
          confidence: profile.confidence,
          updatedAt: profile.updatedAt,
        })
        .onConflictDoUpdate({
          target: [schema.speedProfiles.studentId, schema.speedProfiles.scopeType, schema.speedProfiles.scopeId],
          set: {
            averageTimeMs: profile.averageMs,
            medianTimeMs: profile.medianMs,
            accuracy: profile.accuracy,
            expectedTimeMs: profile.expectedTimeMs,
            expectedTimeSource: profile.expectedTimeSource,
            relativeSpeed: profile.relativeSpeed,
            sampleSize: profile.sampleSize,
            confidence: profile.confidence,
            updatedAt: profile.updatedAt,
          },
        });
    },

    async getProfile(studentId: string, scope: ScopeKey) {
      const [row] = await db
        .select()
        .from(schema.speedProfiles)
        .where(
          and(
            eq(schema.speedProfiles.studentId, studentId),
            eq(schema.speedProfiles.scopeType, scope.scopeType),
            eq(schema.speedProfiles.scopeId, scope.scopeId),
          ),
        );
      if (!row) return null;
      return {
        studentId: row.studentId,
        scope: { scopeType: row.scopeType as ScopeType, scopeId: row.scopeId },
        averageMs: row.averageTimeMs,
        medianMs: row.medianTimeMs,
        accuracy: row.accuracy,
        expectedTimeMs: row.expectedTimeMs,
        expectedTimeSource: (row.expectedTimeSource as ExpectedTimeSource) ?? 'UNKNOWN',
        relativeSpeed: row.relativeSpeed,
        sampleSize: row.sampleSize,
        confidence: row.confidence as EvidenceConfidence,
        updatedAt: row.updatedAt,
      };
    },

    async saveBottleneck(b: NewBottleneckRecord) {
      const [row] = await db
        .insert(schema.speedBottlenecks)
        .values({
          studentId: b.studentId,
          scopeType: b.scope.scopeType,
          scopeId: b.scope.scopeId,
          type: b.type,
          evidence: b.evidence,
          metrics: b.metrics,
          confidence: b.confidence,
          status: b.status,
        })
        .returning();
      const result: BottleneckRecord = {
        id: row.id,
        studentId: row.studentId,
        scope: { scopeType: row.scopeType as ScopeType, scopeId: row.scopeId ?? '' },
        type: row.type as BottleneckType,
        evidence: row.evidence,
        confidence: row.confidence as EvidenceConfidence,
        metrics: (row.metrics as Record<string, number>) ?? {},
        status: row.status as BottleneckRecord['status'],
        detectedAt: row.detectedAt,
      };
      return result;
    },

    async listBottlenecks(studentId: string, scope?: ScopeKey) {
      const rows = await db.select().from(schema.speedBottlenecks).where(eq(schema.speedBottlenecks.studentId, studentId));
      return rows
        .filter((row) => !scope || (row.scopeType === scope.scopeType && row.scopeId === scope.scopeId))
        .map((row) => ({
          id: row.id,
          studentId: row.studentId,
          scope: { scopeType: row.scopeType as ScopeType, scopeId: row.scopeId ?? '' },
          type: row.type as BottleneckType,
          evidence: row.evidence,
          confidence: row.confidence as EvidenceConfidence,
          metrics: (row.metrics as Record<string, number>) ?? {},
          status: row.status as BottleneckRecord['status'],
          detectedAt: row.detectedAt,
        }));
    },

    async upsertTarget(t: SpeedTargetRecord) {
      await db
        .insert(schema.speedTargets)
        .values({
          studentId: t.studentId,
          scopeType: t.scope.scopeType,
          scopeId: t.scope.scopeId,
          currentTargetMs: t.currentTargetMs,
          baselineMs: t.baselineMs,
          guardrailAccuracy: t.guardrailAccuracy,
          lastRampedAt: t.lastRampedAt,
        })
        .onConflictDoUpdate({
          target: [schema.speedTargets.studentId, schema.speedTargets.scopeType, schema.speedTargets.scopeId],
          set: {
            currentTargetMs: t.currentTargetMs,
            baselineMs: t.baselineMs,
            guardrailAccuracy: t.guardrailAccuracy,
            lastRampedAt: t.lastRampedAt,
            updatedAt: new Date(),
          },
        });
    },

    async getTarget(studentId: string, scope: ScopeKey) {
      const [row] = await db
        .select()
        .from(schema.speedTargets)
        .where(
          and(
            eq(schema.speedTargets.studentId, studentId),
            eq(schema.speedTargets.scopeType, scope.scopeType),
            eq(schema.speedTargets.scopeId, scope.scopeId),
          ),
        );
      if (!row) return null;
      return {
        studentId: row.studentId,
        scope: { scopeType: row.scopeType as ScopeType, scopeId: row.scopeId },
        currentTargetMs: row.currentTargetMs,
        baselineMs: row.baselineMs,
        guardrailAccuracy: row.guardrailAccuracy,
        lastRampedAt: row.lastRampedAt,
      };
    },

    async createPacingSession(input: NewPacingSessionInput) {
      const [row] = await db
        .insert(schema.pacingSessions)
        .values({
          studentId: input.studentId,
          speedSessionId: input.speedSessionId ?? null,
          mode: input.mode,
          totalQuestions: input.totalQuestions,
          timeBudgetMs: input.timeBudgetMs,
        })
        .returning();
      return toPacingSession(row);
    },

    async getPacingSession(id: string) {
      const [row] = await db.select().from(schema.pacingSessions).where(eq(schema.pacingSessions.id, id));
      return row ? toPacingSession(row) : null;
    },

    async updatePacingSession(id: string, patch: Partial<PacingSession>) {
      const [row] = await db
        .update(schema.pacingSessions)
        .set({
          timeElapsedMs: patch.timeElapsedMs,
          questionsCompleted: patch.questionsCompleted,
          correctCount: patch.correctCount,
          state: patch.state,
          completedAt: patch.completedAt,
        })
        .where(eq(schema.pacingSessions.id, id))
        .returning();
      if (!row) throw new Error('Pacing session not found.');
      return toPacingSession(row);
    },
  };
}
