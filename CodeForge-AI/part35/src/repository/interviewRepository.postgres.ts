import pg from "pg";
import type {
  InterviewBlueprint,
  InterviewSession,
  InterviewQuestion,
  InterviewResponse,
  StructuredEvaluation,
  SkillEvidenceRecord,
  SessionState,
} from "../domain/types.js";
import type { AuditEvent } from "../integration/ports.js";
import type { InterviewRepositoryPort } from "./types.js";

const { Pool } = pg;
export type PgPool = InstanceType<typeof Pool>;

export function createPgPool(connectionString: string): PgPool {
  return new Pool({ connectionString });
}

/**
 * IMPORTANT: this repository always connects as `app_service`, which has
 * BYPASSRLS (see migration 001). That is the correct role for a trusted
 * backend process — but it means RLS is NOT what keeps org A's rows out of
 * an org B query here. Every read below carries an explicit `org_id = $1`
 * predicate for that reason. RLS (enforced for the `app_authenticated`
 * role) is a second, independent boundary for any future direct/RLS-scoped
 * read path — not a substitute for the explicit filtering in this file.
 */
export class PostgresInterviewRepository implements InterviewRepositoryPort {
  constructor(private readonly pool: PgPool) {}

  private async withServiceContext<T>(orgId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET ROLE app_service");
      await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
      await client.query("SELECT set_config('app.actor_role', 'SYSTEM', true)");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async createBlueprint(bp: InterviewBlueprint): Promise<void> {
    await this.withServiceContext(bp.orgId, async (c) => {
      await c.query(
        `SELECT fn_create_blueprint($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          bp.id, bp.version, bp.targetRole, bp.mode, bp.difficulty,
          JSON.stringify(bp.targetSkills), JSON.stringify(bp.evidenceSourcesUsed),
          JSON.stringify(bp.questionStrategy), JSON.stringify(bp.followUpStrategy),
          JSON.stringify(bp.coverageRules), JSON.stringify(bp.evaluationRules),
          JSON.stringify(bp.timeConfig), bp.createdBy,
        ]
      );
    });
  }

  async getBlueprint(orgId: string, id: string): Promise<InterviewBlueprint | null> {
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM technical_interview_blueprints WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      return rows[0] ? rowToBlueprint(rows[0]) : null;
    });
  }

  async createSession(session: InterviewSession): Promise<InterviewSession> {
    return this.withServiceContext(session.orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM fn_create_session($1, $2)`,
        [session.blueprintId, session.candidateId]
      );
      return rowToSession(rows[0]);
    });
  }

  async getSession(orgId: string, id: string): Promise<InterviewSession | null> {
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM technical_interview_sessions WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      return rows[0] ? rowToSession(rows[0]) : null;
    });
  }

  async updateSession(
    orgId: string,
    id: string,
    patch: Partial<InterviewSession> & { state: SessionState }
  ): Promise<InterviewSession> {
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(`SELECT * FROM fn_transition_session($1, $2)`, [id, patch.state]);
      return rowToSession(rows[0]);
    });
  }

  async addQuestion(question: InterviewQuestion): Promise<InterviewQuestion> {
    // InterviewQuestion doesn't carry orgId directly (it's identified by
    // session), so it's derived from the owning session first.
    const session = await this.getSessionUnsafe(question.sessionId);
    if (!session) throw new Error(`session ${question.sessionId} not found`);
    return this.withServiceContext(session.orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM fn_record_question($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          question.sessionId, question.sequenceNumber, question.questionType, question.skill,
          question.difficulty, question.depthLevel, question.promptText,
          question.evidenceRef?.sourceType ?? null, question.evidenceRef?.artifactId ?? null,
          question.generatedBy, question.parentQuestionId ?? null, question.followUpReason ?? null,
        ]
      );
      return rowToQuestion(rows[0]);
    });
  }

  /**
   * Internal helper for the handful of writes whose caller doesn't already
   * know the org_id (addQuestion/addEvaluation take a domain object that
   * isn't itself org-tagged). Only ever looked up by an indexed primary key
   * that the caller already possesses — never used to enumerate rows across
   * a tenant. `SET ROLE app_service` is required here even though the pool
   * connects as app_conn_service: BYPASSRLS is a role *attribute*, and role
   * attributes are not inherited through membership in Postgres — only
   * privileges (grants) are. Skipping this SET ROLE reproduces exactly the
   * "service role's own reads silently return zero rows" failure mode
   * already hit (and fixed) once before on the related Skill Signal Engine.
   */
  private async lookupOrgId(table: "technical_interview_sessions" | "technical_interview_responses", id: string): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      await client.query("SET ROLE app_service");
      const { rows } = await client.query(`SELECT org_id FROM ${table} WHERE id = $1`, [id]);
      return rows[0]?.org_id ?? null;
    } finally {
      client.release();
    }
  }

  private async getSessionUnsafe(sessionId: string): Promise<{ orgId: string } | null> {
    const orgId = await this.lookupOrgId("technical_interview_sessions", sessionId);
    return orgId ? { orgId } : null;
  }

  async getQuestion(orgId: string, id: string): Promise<InterviewQuestion | null> {
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM technical_interview_questions WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      return rows[0] ? rowToQuestion(rows[0]) : null;
    });
  }

  async listQuestions(orgId: string, sessionId: string): Promise<InterviewQuestion[]> {
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM technical_interview_questions WHERE org_id = $1 AND session_id = $2 ORDER BY sequence_number ASC`,
        [orgId, sessionId]
      );
      return rows.map(rowToQuestion);
    });
  }

  async addResponseIdempotent(
    response: InterviewResponse
  ): Promise<{ response: InterviewResponse; wasDuplicate: boolean }> {
    const session = await this.getSessionUnsafe(response.sessionId);
    if (!session) throw new Error(`session ${response.sessionId} not found`);
    return this.withServiceContext(session.orgId, async (c) => {
      const before = await c.query(
        `SELECT 1 FROM technical_interview_responses WHERE session_id = $1 AND idempotency_key = $2`,
        [response.sessionId, response.idempotencyKey]
      );
      const wasDuplicate = (before.rowCount ?? 0) > 0;
      const { rows } = await c.query(
        `SELECT * FROM fn_submit_response($1,$2,$3,$4)`,
        [response.sessionId, response.questionId, response.responseText, response.idempotencyKey]
      );
      return { response: rowToResponse(rows[0]), wasDuplicate };
    });
  }

  async getResponse(orgId: string, id: string): Promise<InterviewResponse | null> {
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM technical_interview_responses WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      return rows[0] ? rowToResponse(rows[0]) : null;
    });
  }

  async listResponses(orgId: string, sessionId: string): Promise<InterviewResponse[]> {
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM technical_interview_responses WHERE org_id = $1 AND session_id = $2 ORDER BY submitted_at ASC`,
        [orgId, sessionId]
      );
      return rows.map(rowToResponse);
    });
  }

  async addEvaluation(evaluation: StructuredEvaluation): Promise<StructuredEvaluation> {
    const orgId = await this.lookupOrgId("technical_interview_responses", evaluation.responseId);
    if (!orgId) throw new Error(`response ${evaluation.responseId} not found`);
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM fn_record_evaluation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          evaluation.responseId, evaluation.evaluationVersion,
          evaluation.dimensions.TECHNICAL_CORRECTNESS ?? null, evaluation.dimensions.REASONING_QUALITY ?? null,
          evaluation.dimensions.UNDERSTANDING ?? null, evaluation.dimensions.DEPTH ?? null,
          evaluation.dimensions.APPLICATION ?? null, evaluation.consistency,
          evaluation.dimensions.COMMUNICATION_CLARITY ?? null, evaluation.answerQuality,
          evaluation.evidenceConfidence, evaluation.rationaleSummary, evaluation.status, evaluation.grounded,
        ]
      );
      return rowToEvaluation(rows[0]);
    });
  }

  async getEvaluationForResponse(orgId: string, responseId: string): Promise<StructuredEvaluation | null> {
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM technical_interview_evaluations_latest WHERE org_id = $1 AND response_id = $2`,
        [orgId, responseId]
      );
      return rows[0] ? rowToEvaluation(rows[0]) : null;
    });
  }

  async listEvaluations(orgId: string, sessionId: string): Promise<StructuredEvaluation[]> {
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT e.* FROM technical_interview_evaluations_latest e
         JOIN technical_interview_responses r ON r.id = e.response_id
         WHERE e.org_id = $1 AND r.session_id = $2`,
        [orgId, sessionId]
      );
      return rows.map(rowToEvaluation);
    });
  }

  async addSkillEvidence(
    orgId: string,
    sessionId: string,
    _candidateId: string,
    records: SkillEvidenceRecord[]
  ): Promise<void> {
    await this.withServiceContext(orgId, async (c) => {
      for (const r of records) {
        await c.query(`SELECT fn_record_skill_evidence($1,$2,$3,$4,$5)`, [
          sessionId, r.skill, r.evidenceState, r.confidence, JSON.stringify(r.supportingEvaluationIds),
        ]);
      }
    });
  }

  async recordEvent(event: AuditEvent): Promise<void> {
    await this.withServiceContext(event.orgId, async (c) => {
      await c.query(`SELECT fn_record_event($1,$2,$3,$4)`, [
        event.sessionId, event.eventType, event.actor, JSON.stringify(event.metadata),
      ]);
    });
  }

  async listSessionsForCandidate(orgId: string, candidateId: string): Promise<InterviewSession[]> {
    return this.withServiceContext(orgId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM technical_interview_sessions WHERE org_id = $1 AND candidate_id = $2 ORDER BY created_at DESC`,
        [orgId, candidateId]
      );
      return rows.map(rowToSession);
    });
  }
}

// ---------------------------------------------------------------------------
// Row mappers — snake_case DB rows -> camelCase domain shapes
// ---------------------------------------------------------------------------
function rowToBlueprint(row: any): InterviewBlueprint {
  return {
    id: row.id, orgId: row.org_id, version: row.version, targetRole: row.target_role,
    mode: row.interview_mode, difficulty: row.difficulty, targetSkills: row.target_skills,
    evidenceSourcesUsed: row.evidence_sources_used, questionStrategy: row.question_strategy,
    followUpStrategy: row.follow_up_strategy, coverageRules: row.coverage_rules,
    evaluationRules: row.evaluation_rules, timeConfig: row.time_config,
    createdBy: row.created_by, createdAt: row.created_at.toISOString(),
  };
}

function rowToSession(row: any): InterviewSession {
  return {
    id: row.id, orgId: row.org_id, blueprintId: row.blueprint_id, blueprintVersion: row.blueprint_version,
    candidateId: row.candidate_id, state: row.state, currentQuestionId: row.current_question_id,
    startedAt: row.started_at?.toISOString() ?? null, pausedAt: row.paused_at?.toISOString() ?? null,
    resumedAt: row.resumed_at?.toISOString() ?? null, completedAt: row.completed_at?.toISOString() ?? null,
    lastActivityAt: row.last_activity_at.toISOString(), createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToQuestion(row: any): InterviewQuestion {
  return {
    id: row.id, sessionId: row.session_id, sequenceNumber: row.sequence_number,
    questionType: row.question_type, skill: row.skill, difficulty: row.difficulty,
    depthLevel: row.depth_level, promptText: row.prompt_text,
    evidenceRef: row.evidence_source_type
      ? { sourceType: row.evidence_source_type, artifactId: row.evidence_artifact_id }
      : undefined,
    generatedBy: row.generated_by, parentQuestionId: row.parent_question_id ?? undefined,
    followUpReason: row.follow_up_reason ?? undefined,
  };
}

function rowToResponse(row: any): InterviewResponse {
  return {
    id: row.id, sessionId: row.session_id, questionId: row.question_id, candidateId: row.candidate_id,
    responseText: row.response_text, submittedAt: row.submitted_at.toISOString(),
    idempotencyKey: row.idempotency_key,
  };
}

function rowToEvaluation(row: any): StructuredEvaluation {
  return {
    id: row.id, responseId: row.response_id, evaluationVersion: row.evaluation_version,
    answerQuality: row.answer_quality, consistency: row.consistency, evidenceConfidence: row.evidence_confidence,
    rationaleSummary: row.rationale_summary, status: row.status, grounded: row.grounded,
    dimensions: {
      TECHNICAL_CORRECTNESS: row.technical_correctness ?? undefined,
      REASONING_QUALITY: row.reasoning_quality ?? undefined,
      UNDERSTANDING: row.understanding ?? undefined,
      DEPTH: row.depth ?? undefined,
      APPLICATION: row.application ?? undefined,
      COMMUNICATION_CLARITY: row.communication_clarity ?? undefined,
    },
  };
}
