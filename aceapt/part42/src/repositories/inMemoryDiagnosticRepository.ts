import { randomUUID } from "node:crypto";
import type {
  Blueprint,
  DiagnosticSession,
  QualityFlag,
  RawResponseInput,
  SessionStatus,
  SkillEstimate,
  StudentDiagnosticProfile,
} from "../types/domain.js";
import type { DiagnosticRepository, StudentContext } from "../types/contracts.js";

interface InternalSession {
  id: string;
  tenantId: string;
  studentId: string;
  blueprintId: string;
  mode: string;
  status: SessionStatus;
  workingState: Record<string, unknown>;
  baselineSessionId: string | null;
  startedAt: string;
  lastActivityAt: string;
}

interface InternalResponse {
  id: string;
  sessionId: string;
  studentId: string;
  questionId: string;
  skillNodeId: string;
  clientResponseId: string;
  isCorrect: boolean | null;
  durationMs: number;
  expectedDurationMs: number;
  difficulty: RawResponseInput["questionDifficulty"];
  confidence?: number;
  createdAt: string;
}

interface InternalEvidence {
  responseId: string;
  sessionId: string;
  studentId: string;
  skillNodeId: string;
  evidenceWeight: number;
  timingClassification: string;
  qualityFlags: QualityFlag[];
  createdAt: string;
}

interface InternalSnapshot {
  id: string;
  sessionId: string;
  studentId: string;
  snapshotType: string;
  profileJson: StudentDiagnosticProfile;
  createdAt: string;
}

/**
 * Same-process, no persistence across runs. Ownership checks and status
 * transitions here MUST mirror db/migrations/002_rls_and_functions.sql
 * exactly — this is what tests/integration/postgresRls.test.ts effectively
 * spot-checks by running the same behavioral tests through both.
 */
export class InMemoryDiagnosticRepository implements DiagnosticRepository {
  private blueprints = new Map<string, Blueprint>();
  private sessions = new Map<string, InternalSession>();
  private responses: InternalResponse[] = [];
  private evidence: InternalEvidence[] = [];
  private skillEstimates = new Map<string, Map<string, SkillEstimate>>(); // sessionId -> skillNodeId -> estimate
  private snapshots: InternalSnapshot[] = [];
  private recommendations = new Map<string, unknown[]>(); // sessionId -> recs
  private exposures = new Map<string, number>(); // `${studentId}:${questionId}` -> timesSeen

  seedBlueprint(blueprint: Blueprint) {
    this.blueprints.set(blueprint.id, blueprint);
  }

  async getBlueprint(blueprintId: string): Promise<Blueprint | null> {
    return this.blueprints.get(blueprintId) ?? null;
  }

  private toDomainSession(s: InternalSession): DiagnosticSession {
    return {
      id: s.id,
      tenantId: s.tenantId,
      studentId: s.studentId,
      blueprintId: s.blueprintId,
      mode: s.mode as DiagnosticSession["mode"],
      status: s.status,
      workingState: s.workingState,
      baselineSessionId: s.baselineSessionId,
      startedAt: s.startedAt,
      lastActivityAt: s.lastActivityAt,
      responseCount: this.responses.filter((r) => r.sessionId === s.id).length,
    };
  }

  async startOrResumeSession(ctx: StudentContext, blueprintId: string, mode: string) {
    const existing = [...this.sessions.values()].find(
      (s) =>
        s.studentId === ctx.studentId &&
        s.tenantId === ctx.tenantId &&
        s.blueprintId === blueprintId &&
        s.mode === mode &&
        (s.status === "in_progress" || s.status === "paused"),
    );
    if (existing) return { session: this.toDomainSession(existing), resumed: true };

    const session: InternalSession = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      studentId: ctx.studentId,
      blueprintId,
      mode,
      status: "in_progress",
      workingState: {},
      baselineSessionId: null,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    return { session: this.toDomainSession(session), resumed: false };
  }

  private ownedSession(ctx: StudentContext, sessionId: string): InternalSession | undefined {
    const s = this.sessions.get(sessionId);
    if (!s || s.studentId !== ctx.studentId || s.tenantId !== ctx.tenantId) return undefined;
    return s;
  }

  async getSessionState(ctx: StudentContext, sessionId: string): Promise<DiagnosticSession | null> {
    const s = this.ownedSession(ctx, sessionId);
    return s ? this.toDomainSession(s) : null;
  }

  async saveWorkingState(ctx: StudentContext, sessionId: string, workingState: Record<string, unknown>) {
    const s = this.ownedSession(ctx, sessionId);
    if (!s || s.status !== "in_progress") return false;
    s.workingState = workingState;
    s.lastActivityAt = new Date().toISOString();
    return true;
  }

  async submitResponse(
    ctx: StudentContext,
    sessionId: string,
    response: RawResponseInput,
    evidenceInput: { evidenceWeight: number; timingClassification: string; qualityFlags: QualityFlag[] },
    updatedEstimates: SkillEstimate[],
  ) {
    const s = this.ownedSession(ctx, sessionId);
    if (!s) throw new Error("DIAG_SESSION_NOT_FOUND");
    if (s.status !== "in_progress") return { ok: false as const, reason: "SESSION_NOT_ACTIVE" };

    const existing = this.responses.find((r) => r.sessionId === sessionId && r.clientResponseId === response.clientResponseId);
    if (existing) {
      s.lastActivityAt = new Date().toISOString();
      return { ok: true as const, duplicate: true, responseId: existing.id };
    }

    const responseId = randomUUID();
    const createdAt = new Date().toISOString();
    this.responses.push({
      id: responseId,
      sessionId,
      studentId: ctx.studentId,
      questionId: response.questionId,
      skillNodeId: response.skillNodeId,
      clientResponseId: response.clientResponseId,
      isCorrect: response.isCorrect,
      durationMs: response.durationMs,
      expectedDurationMs: response.expectedDurationMs,
      difficulty: response.questionDifficulty,
      confidence: response.confidence,
      createdAt,
    });
    this.evidence.push({
      responseId,
      sessionId,
      studentId: ctx.studentId,
      skillNodeId: response.skillNodeId,
      evidenceWeight: evidenceInput.evidenceWeight,
      timingClassification: evidenceInput.timingClassification,
      qualityFlags: evidenceInput.qualityFlags,
      createdAt,
    });

    const exposureKey = `${ctx.studentId}:${response.questionId}`;
    this.exposures.set(exposureKey, (this.exposures.get(exposureKey) ?? 0) + 1);

    const estimatesForSession = this.skillEstimates.get(sessionId) ?? new Map();
    for (const est of updatedEstimates) estimatesForSession.set(est.skillNodeId, est);
    this.skillEstimates.set(sessionId, estimatesForSession);

    s.lastActivityAt = new Date().toISOString();
    return { ok: true as const, duplicate: false, responseId };
  }

  async pauseSession(ctx: StudentContext, sessionId: string) {
    const s = this.ownedSession(ctx, sessionId);
    if (!s || s.status !== "in_progress") return { ok: false, reason: "INVALID_TRANSITION" };
    s.status = "paused";
    return { ok: true };
  }

  async resumeSession(ctx: StudentContext, sessionId: string) {
    const s = this.ownedSession(ctx, sessionId);
    if (!s || s.status !== "paused") return { ok: false, reason: "INVALID_TRANSITION" };
    s.status = "in_progress";
    s.lastActivityAt = new Date().toISOString();
    return { ok: true };
  }

  async abandonOrExpireSession(ctx: StudentContext, sessionId: string, status: "abandoned" | "expired") {
    const s = this.ownedSession(ctx, sessionId);
    if (!s || (s.status !== "in_progress" && s.status !== "paused")) return { ok: false, reason: "INVALID_TRANSITION" };
    s.status = status;
    return { ok: true };
  }

  async completeSession(ctx: StudentContext, sessionId: string, finalProfile: StudentDiagnosticProfile) {
    const s = this.ownedSession(ctx, sessionId);
    if (!s || (s.status !== "in_progress" && s.status !== "paused")) return { ok: false, reason: "INVALID_TRANSITION" };

    const hasBaseline = this.snapshots.some(
      (sn) =>
        sn.snapshotType === "baseline" &&
        sn.studentId === ctx.studentId &&
        this.sessions.get(sn.sessionId)?.blueprintId === s.blueprintId,
    );
    const snapshotType = !hasBaseline ? "baseline" : s.baselineSessionId ? "reassessment" : "current";

    s.status = "completed";
    this.snapshots.push({
      id: randomUUID(),
      sessionId,
      studentId: ctx.studentId,
      snapshotType,
      profileJson: finalProfile,
      createdAt: new Date().toISOString(),
    });
    return { ok: true, snapshotType };
  }

  async startReassessment(ctx: StudentContext, blueprintId: string) {
    const priorCompleted = [...this.sessions.values()]
      .filter((s) => s.studentId === ctx.studentId && s.tenantId === ctx.tenantId && s.blueprintId === blueprintId && s.status === "completed")
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];

    if (!priorCompleted) return { ok: false as const, reason: "NO_PRIOR_DIAGNOSTIC_TO_COMPARE_AGAINST" };

    const session: InternalSession = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      studentId: ctx.studentId,
      blueprintId,
      mode: "reassessment",
      status: "in_progress",
      workingState: {},
      baselineSessionId: priorCompleted.id,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    return { ok: true as const, sessionId: session.id, baselineSessionId: priorCompleted.id };
  }

  async getSkillEstimates(ctx: StudentContext, sessionId: string): Promise<SkillEstimate[]> {
    const s = this.ownedSession(ctx, sessionId);
    if (!s) return [];
    return [...(this.skillEstimates.get(sessionId)?.values() ?? [])];
  }

  async getSessionEvidenceRaw(ctx: StudentContext, sessionId: string) {
    const s = this.ownedSession(ctx, sessionId);
    if (!s) return [];
    return this.evidence
      .filter((e) => e.sessionId === sessionId && e.studentId === ctx.studentId)
      .map((e) => {
        const response = this.responses.find((r) => r.id === e.responseId);
        return {
          skillNodeId: e.skillNodeId,
          isCorrect: response?.isCorrect ?? null,
          evidenceWeight: e.evidenceWeight,
          createdAt: e.createdAt,
          durationMs: response?.durationMs ?? 0,
          expectedDurationMs: response?.expectedDurationMs ?? 1,
          difficulty: response?.difficulty ?? "medium",
          confidence: response?.confidence,
        };
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getLatestSnapshot(ctx: StudentContext, sessionId: string, snapshotType?: string) {
    const matches = this.snapshots
      .filter((sn) => sn.sessionId === sessionId && sn.studentId === ctx.studentId && (!snapshotType || sn.snapshotType === snapshotType))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matches[0]?.profileJson ?? null;
  }

  async getBaselineVsCurrent(ctx: StudentContext, sessionId: string) {
    const current = await this.getLatestSnapshot(ctx, sessionId);
    const s = this.ownedSession(ctx, sessionId);
    const baseline = s?.baselineSessionId ? await this.getLatestSnapshot(ctx, s.baselineSessionId) : null;
    return { current, baseline };
  }

  async getEvidenceTrail(ctx: StudentContext, skillNodeId: string, sessionId: string) {
    const s = this.ownedSession(ctx, sessionId);
    if (!s) return [];
    return this.evidence
      .filter((e) => e.sessionId === sessionId && e.studentId === ctx.studentId && e.skillNodeId === skillNodeId)
      .map((e) => ({ ...e, response: this.responses.find((r) => r.id === e.responseId) }));
  }

  async recordRecommendations(ctx: StudentContext, sessionId: string, recommendations: unknown[]) {
    const s = this.ownedSession(ctx, sessionId);
    if (!s) return false;
    this.recommendations.set(sessionId, recommendations);
    return true;
  }

  async getRecommendations(ctx: StudentContext, sessionId: string) {
    const s = this.ownedSession(ctx, sessionId);
    if (!s) return [];
    return this.recommendations.get(sessionId) ?? [];
  }

  async getQuestionExposure(ctx: StudentContext, questionId: string): Promise<number> {
    return this.exposures.get(`${ctx.studentId}:${questionId}`) ?? 0;
  }
}
