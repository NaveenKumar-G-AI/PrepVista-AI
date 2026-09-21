import type { Pool } from "pg";
import type {
  Blueprint,
  BlueprintNode,
  DiagnosticSession,
  QualityFlag,
  RawResponseInput,
  SkillEstimate,
  StudentDiagnosticProfile,
} from "../types/domain.js";
import type { DiagnosticRepository, StudentContext } from "../types/contracts.js";

/**
 * Every method here is exactly one call to a function from
 * db/migrations/002_rls_and_functions.sql / 003_session_evidence_read.sql,
 * over a pool authenticated as diag_app. diag_app has zero raw grants on
 * any per-student table (verified directly — see TRUTH_TABLE.md for the
 * exact commands run), so there is no code path in this class that could
 * read or write another student's row even if a parameter were wrong.
 */
export class PostgresDiagnosticRepository implements DiagnosticRepository {
  constructor(private pool: Pool) {}

  private async call<T>(fn: string, args: unknown[]): Promise<T> {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await this.pool.query(`select ${fn}(${placeholders}) as result`, args);
    return rows[0].result as T;
  }

  async getBlueprint(blueprintId: string): Promise<Blueprint | null> {
    const { rows: bpRows } = await this.pool.query(
      "select id, name, mode from diagnostic_blueprints where id = $1",
      [blueprintId],
    );
    if (bpRows.length === 0) return null;

    const { rows: nodeRows } = await this.pool.query(
      `select id, blueprint_id, parent_node_id, level, code, label, min_evidence_count, target_difficulty_weight
         from diagnostic_blueprint_nodes where blueprint_id = $1`,
      [blueprintId],
    );

    const nodes: BlueprintNode[] = nodeRows.map((r) => ({
      id: r.id,
      blueprintId: r.blueprint_id,
      parentNodeId: r.parent_node_id,
      level: r.level,
      code: r.code,
      label: r.label,
      minEvidenceCount: r.min_evidence_count,
      targetDifficultyWeight: r.target_difficulty_weight,
    }));

    return { id: bpRows[0].id, name: bpRows[0].name, mode: bpRows[0].mode, nodes };
  }

  async startOrResumeSession(ctx: StudentContext, blueprintId: string, mode: string) {
    const result = await this.call<any>("diag_start_or_resume_session", [ctx.tenantId, ctx.studentId, blueprintId, mode]);
    const session = await this.getSessionState(ctx, result.session_id);
    return { session: session as DiagnosticSession, resumed: result.resumed };
  }

  async getSessionState(ctx: StudentContext, sessionId: string): Promise<DiagnosticSession | null> {
    const result = await this.call<any>("diag_get_session_state", [ctx.tenantId, ctx.studentId, sessionId]);
    if (!result.ok) return null;
    return {
      id: result.session_id,
      tenantId: ctx.tenantId,
      studentId: ctx.studentId,
      blueprintId: result.blueprint_id,
      mode: result.mode,
      status: result.status,
      workingState: result.working_state ?? {},
      baselineSessionId: result.baseline_session_id,
      startedAt: result.started_at,
      lastActivityAt: result.started_at,
      responseCount: result.response_count,
    };
  }

  async saveWorkingState(ctx: StudentContext, sessionId: string, workingState: Record<string, unknown>) {
    const result = await this.call<any>("diag_save_working_state", [ctx.tenantId, ctx.studentId, sessionId, JSON.stringify(workingState)]);
    return !!result.ok;
  }

  async submitResponse(
    ctx: StudentContext,
    sessionId: string,
    response: RawResponseInput,
    evidence: { evidenceWeight: number; timingClassification: string; qualityFlags: QualityFlag[] },
    updatedEstimates: SkillEstimate[],
  ) {
    const responsePayload = {
      question_id: response.questionId,
      skill_node_id: response.skillNodeId,
      client_response_id: response.clientResponseId,
      answer: response.answer,
      is_correct: response.isCorrect,
      question_difficulty: response.questionDifficulty,
      expected_duration_ms: response.expectedDurationMs,
      started_at: response.startedAt,
      completed_at: response.completedAt,
      duration_ms: response.durationMs,
      confidence: response.confidence ?? null,
      hint_used: response.hintUsed,
      attempt_number: response.attemptNumber,
      was_previously_exposed: response.wasPreviouslyExposed,
    };
    const evidencePayload = {
      evidence_weight: evidence.evidenceWeight,
      timing_classification: evidence.timingClassification,
      quality_flags: evidence.qualityFlags,
    };
    const estimatesPayload = updatedEstimates.map((e) => ({
      skill_node_id: e.skillNodeId,
      point_estimate: e.pointEstimate,
      status: e.status,
      confidence_state: e.confidenceState,
      evidence_count: e.evidenceCount,
      weighted_evidence: e.weightedEvidence,
      consistency_flag: e.consistencyFlag,
    }));

    const result = await this.call<any>("diag_submit_response", [
      ctx.tenantId,
      ctx.studentId,
      sessionId,
      JSON.stringify(responsePayload),
      JSON.stringify(evidencePayload),
      JSON.stringify(estimatesPayload),
    ]);

    if (!result.ok) return { ok: false as const, reason: result.reason };
    return { ok: true as const, duplicate: result.duplicate, responseId: result.response_id };
  }

  async pauseSession(ctx: StudentContext, sessionId: string) {
    const result = await this.call<any>("diag_pause_session", [ctx.tenantId, ctx.studentId, sessionId, null]);
    return { ok: !!result.ok, reason: result.reason };
  }

  async resumeSession(ctx: StudentContext, sessionId: string) {
    const result = await this.call<any>("diag_resume_session", [ctx.tenantId, ctx.studentId, sessionId]);
    return { ok: !!result.ok, reason: result.reason };
  }

  async abandonOrExpireSession(ctx: StudentContext, sessionId: string, status: "abandoned" | "expired") {
    const result = await this.call<any>("diag_abandon_or_expire_session", [ctx.tenantId, ctx.studentId, sessionId, status]);
    return { ok: !!result.ok, reason: result.reason };
  }

  async completeSession(ctx: StudentContext, sessionId: string, finalProfile: StudentDiagnosticProfile) {
    const result = await this.call<any>("diag_complete_session", [ctx.tenantId, ctx.studentId, sessionId, JSON.stringify(finalProfile)]);
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, snapshotType: result.snapshot_type };
  }

  async startReassessment(ctx: StudentContext, blueprintId: string) {
    const result = await this.call<any>("diag_start_reassessment", [ctx.tenantId, ctx.studentId, blueprintId]);
    if (!result.ok) return { ok: false as const, reason: result.reason };
    return { ok: true as const, sessionId: result.session_id, baselineSessionId: result.baseline_session_id };
  }

  async getSkillEstimates(ctx: StudentContext, sessionId: string): Promise<SkillEstimate[]> {
    const rows = await this.call<any[]>("diag_get_skill_estimates", [ctx.tenantId, ctx.studentId, sessionId]);
    return rows.map((r) => ({
      skillNodeId: r.skill_node_id,
      nodeLevel: r.node_level,
      nodeCode: r.node_code,
      nodeLabel: r.node_label,
      parentNodeId: r.parent_node_id,
      pointEstimate: Number(r.point_estimate),
      status: r.status,
      confidenceState: r.confidence_state,
      evidenceCount: r.evidence_count,
      weightedEvidence: Number(r.weighted_evidence),
      consistencyFlag: r.consistency_flag,
    }));
  }

  async getSessionEvidenceRaw(ctx: StudentContext, sessionId: string) {
    const rows = await this.call<any[]>("diag_get_all_session_evidence", [ctx.tenantId, ctx.studentId, sessionId]);
    return rows.map((r) => ({
      skillNodeId: r.skill_node_id,
      isCorrect: r.is_correct,
      evidenceWeight: Number(r.evidence_weight),
      createdAt: r.created_at,
      durationMs: r.duration_ms,
      expectedDurationMs: r.expected_duration_ms,
      difficulty: r.question_difficulty,
      confidence: r.confidence ?? undefined,
    }));
  }

  async getLatestSnapshot(ctx: StudentContext, sessionId: string, snapshotType?: string) {
    const result = await this.call<any>("diag_get_latest_snapshot", [ctx.tenantId, ctx.studentId, sessionId, snapshotType ?? null]);
    return (result?.profile_json as StudentDiagnosticProfile) ?? null;
  }

  async getBaselineVsCurrent(ctx: StudentContext, sessionId: string) {
    const result = await this.call<any>("diag_get_baseline_vs_current", [ctx.tenantId, ctx.studentId, sessionId]);
    return { current: result.current ?? null, baseline: result.baseline ?? null };
  }

  async getEvidenceTrail(ctx: StudentContext, skillNodeId: string, sessionId: string) {
    return this.call<unknown[]>("diag_get_evidence_trail", [ctx.tenantId, ctx.studentId, skillNodeId, sessionId]);
  }

  async recordRecommendations(ctx: StudentContext, sessionId: string, recommendations: unknown[]) {
    const result = await this.call<any>("diag_record_recommendations", [ctx.tenantId, ctx.studentId, sessionId, JSON.stringify(recommendations)]);
    return !!result.ok;
  }

  async getRecommendations(ctx: StudentContext, sessionId: string) {
    return this.call<unknown[]>("diag_get_recommendations", [ctx.tenantId, ctx.studentId, sessionId]);
  }

  async getQuestionExposure(ctx: StudentContext, questionId: string): Promise<number> {
    return this.call<number>("diag_get_question_exposure", [ctx.tenantId, ctx.studentId, questionId]);
  }
}
