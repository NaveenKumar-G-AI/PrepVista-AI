import { randomUUID } from 'crypto';
import { PacingSession, SessionState, SpeedAttemptRecord, SpeedSession } from '../../types/domain';
import {
  attemptMatchesScope,
  BottleneckRecord,
  NewAttemptForRepo,
  NewBottleneckRecord,
  NewPacingSessionInput,
  NewSpeedSessionInput,
  scopeKeyString,
  SpeedProfileRecord,
  SpeedRepository,
  SpeedSessionPatch,
  SpeedTargetRecord,
} from './types';

/** Full in-memory implementation of SpeedRepository. This is the reference
 * implementation exercised by every automated test in /tests, and doubles
 * as a zero-configuration local/demo mode (see src/api/app.ts) - data does
 * not persist across restarts. */
export function createInMemorySpeedRepository(): SpeedRepository {
  const sessions = new Map<string, SpeedSession>();
  const attempts = new Map<string, SpeedAttemptRecord>();
  const attemptIdempotency = new Map<string, string>(); // `${sessionId}:${clientAttemptId}` -> attemptId
  const profiles = new Map<string, SpeedProfileRecord>();
  const bottlenecks: BottleneckRecord[] = [];
  const targets = new Map<string, SpeedTargetRecord>();
  const pacingSessions = new Map<string, PacingSession>();

  return {
    async createSession(input: NewSpeedSessionInput) {
      const now = new Date();
      const session: SpeedSession = {
        id: randomUUID(),
        studentId: input.studentId,
        mode: input.mode,
        pressureLevel: input.pressureLevel,
        state: input.state,
        scope: input.scope,
        targetTimeMs: input.targetTimeMs,
        guardrailAccuracy: input.guardrailAccuracy,
        goalId: input.goalId ?? null,
        startedAt: now,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      sessions.set(session.id, session);
      return session;
    },

    async getSession(id: string) {
      return sessions.get(id) ?? null;
    },

    async updateSession(id: string, patch: SpeedSessionPatch) {
      const existing = sessions.get(id);
      if (!existing) throw new Error('Session not found.');
      const updated: SpeedSession = { ...existing, ...patch, updatedAt: new Date() };
      sessions.set(id, updated);
      return updated;
    },

    async addAttempt(input: NewAttemptForRepo) {
      const idemKey = `${input.sessionId}:${input.clientAttemptId}`;
      const existingId = attemptIdempotency.get(idemKey);
      if (existingId) {
        // Idempotent replay: return the original attempt rather than creating a duplicate (spec 143).
        return attempts.get(existingId)!;
      }
      const record: SpeedAttemptRecord = { ...input, id: randomUUID(), createdAt: new Date() };
      attempts.set(record.id, record);
      attemptIdempotency.set(idemKey, record.id);
      return record;
    },

    async listAttemptsBySession(sessionId: string) {
      return [...attempts.values()]
        .filter((a) => a.sessionId === sessionId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },

    async listRecentAttemptsByScope(studentId: string, scope, limit: number) {
      return [...attempts.values()]
        .filter((a) => a.studentId === studentId && attemptMatchesScope(a, scope))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(-limit);
    },

    async upsertProfile(profile: SpeedProfileRecord) {
      profiles.set(`${profile.studentId}:${scopeKeyString(profile.scope)}`, profile);
    },

    async getProfile(studentId: string, scope) {
      return profiles.get(`${studentId}:${scopeKeyString(scope)}`) ?? null;
    },

    async saveBottleneck(b: NewBottleneckRecord) {
      const record: BottleneckRecord = { ...b, id: randomUUID(), detectedAt: new Date() };
      bottlenecks.push(record);
      return record;
    },

    async listBottlenecks(studentId: string, scope) {
      return bottlenecks.filter((b) => b.studentId === studentId && (!scope || scopeKeyString(b.scope) === scopeKeyString(scope)));
    },

    async upsertTarget(t: SpeedTargetRecord) {
      targets.set(`${t.studentId}:${scopeKeyString(t.scope)}`, t);
    },

    async getTarget(studentId: string, scope) {
      return targets.get(`${studentId}:${scopeKeyString(scope)}`) ?? null;
    },

    async createPacingSession(input: NewPacingSessionInput) {
      const now = new Date();
      const session: PacingSession = {
        id: randomUUID(),
        studentId: input.studentId,
        speedSessionId: input.speedSessionId ?? null,
        mode: input.mode,
        totalQuestions: input.totalQuestions,
        timeBudgetMs: input.timeBudgetMs,
        timeElapsedMs: 0,
        questionsCompleted: 0,
        correctCount: 0,
        state: SessionState.READY,
        startedAt: now,
        completedAt: null,
      };
      pacingSessions.set(session.id, session);
      return session;
    },

    async getPacingSession(id: string) {
      return pacingSessions.get(id) ?? null;
    },

    async updatePacingSession(id: string, patch: Partial<PacingSession>) {
      const existing = pacingSessions.get(id);
      if (!existing) throw new Error('Pacing session not found.');
      const updated = { ...existing, ...patch };
      pacingSessions.set(id, updated);
      return updated;
    },
  };
}
