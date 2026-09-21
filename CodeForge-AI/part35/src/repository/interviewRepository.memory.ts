import type {
  InterviewBlueprint,
  InterviewSession,
  InterviewQuestion,
  InterviewResponse,
  StructuredEvaluation,
  SkillEvidenceRecord,
} from "../domain/types.js";
import type { AuditEvent } from "../integration/ports.js";
import type { InterviewRepositoryPort } from "./types.js";

/** DEV/TEST ONLY. Not multi-process safe, not durable. Mirrors the Postgres implementation's tenant scoping so orchestration logic gets exercised the same way in both. */
export class InMemoryInterviewRepository implements InterviewRepositoryPort {
  private blueprints = new Map<string, InterviewBlueprint>();
  private sessions = new Map<string, InterviewSession>();
  private questions = new Map<string, InterviewQuestion>();
  private responses = new Map<string, InterviewResponse>();
  private responsesByIdempotencyKey = new Map<string, string>(); // `${sessionId}:${key}` -> responseId
  private evaluations = new Map<string, StructuredEvaluation>(); // keyed by responseId
  private skillEvidence: Array<{ orgId: string; sessionId: string; candidateId: string; record: SkillEvidenceRecord }> = [];
  public events: AuditEvent[] = [];

  async createBlueprint(bp: InterviewBlueprint): Promise<void> {
    this.blueprints.set(bp.id, structuredClone(bp));
  }

  async getBlueprint(orgId: string, id: string): Promise<InterviewBlueprint | null> {
    const bp = this.blueprints.get(id);
    if (!bp || bp.orgId !== orgId) return null;
    return structuredClone(bp);
  }

  async createSession(session: InterviewSession): Promise<InterviewSession> {
    this.sessions.set(session.id, structuredClone(session));
    return structuredClone(session);
  }

  async getSession(orgId: string, id: string): Promise<InterviewSession | null> {
    const s = this.sessions.get(id);
    if (!s || s.orgId !== orgId) return null;
    return structuredClone(s);
  }

  async updateSession(
    orgId: string,
    id: string,
    patch: Partial<InterviewSession> & { state: InterviewSession["state"] }
  ): Promise<InterviewSession> {
    const existing = this.sessions.get(id);
    if (!existing || existing.orgId !== orgId) {
      throw new Error(`Session ${id} not found in org ${orgId}`);
    }
    const updated: InterviewSession = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(id, updated);
    return structuredClone(updated);
  }

  async addQuestion(question: InterviewQuestion): Promise<InterviewQuestion> {
    this.questions.set(question.id, structuredClone(question));
    // Mirrors the Postgres SECURITY DEFINER function, which updates the
    // owning session's current_question_id as part of recording a question.
    const session = this.sessions.get(question.sessionId);
    if (session) {
      this.sessions.set(question.sessionId, {
        ...session,
        currentQuestionId: question.id,
        lastActivityAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return structuredClone(question);
  }

  async getQuestion(orgId: string, id: string): Promise<InterviewQuestion | null> {
    const q = this.questions.get(id);
    if (!q) return null;
    const session = this.sessions.get(q.sessionId);
    if (!session || session.orgId !== orgId) return null;
    return structuredClone(q);
  }

  async listQuestions(orgId: string, sessionId: string): Promise<InterviewQuestion[]> {
    const session = this.sessions.get(sessionId);
    if (!session || session.orgId !== orgId) return [];
    return [...this.questions.values()]
      .filter((q) => q.sessionId === sessionId)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      .map((q) => structuredClone(q));
  }

  async addResponseIdempotent(
    response: InterviewResponse
  ): Promise<{ response: InterviewResponse; wasDuplicate: boolean }> {
    const key = `${response.sessionId}:${response.idempotencyKey}`;
    const existingId = this.responsesByIdempotencyKey.get(key);
    if (existingId) {
      const existing = this.responses.get(existingId);
      if (existing) return { response: structuredClone(existing), wasDuplicate: true };
    }
    this.responses.set(response.id, structuredClone(response));
    this.responsesByIdempotencyKey.set(key, response.id);
    return { response: structuredClone(response), wasDuplicate: false };
  }

  async getResponse(orgId: string, id: string): Promise<InterviewResponse | null> {
    const r = this.responses.get(id);
    if (!r) return null;
    const session = this.sessions.get(r.sessionId);
    if (!session || session.orgId !== orgId) return null;
    return structuredClone(r);
  }

  async listResponses(orgId: string, sessionId: string): Promise<InterviewResponse[]> {
    const session = this.sessions.get(sessionId);
    if (!session || session.orgId !== orgId) return [];
    return [...this.responses.values()]
      .filter((r) => r.sessionId === sessionId)
      .map((r) => structuredClone(r));
  }

  async addEvaluation(evaluation: StructuredEvaluation): Promise<StructuredEvaluation> {
    this.evaluations.set(evaluation.responseId, structuredClone(evaluation));
    return structuredClone(evaluation);
  }

  async getEvaluationForResponse(orgId: string, responseId: string): Promise<StructuredEvaluation | null> {
    const evalRec = this.evaluations.get(responseId);
    if (!evalRec) return null;
    const response = this.responses.get(responseId);
    if (!response) return null;
    const session = this.sessions.get(response.sessionId);
    if (!session || session.orgId !== orgId) return null;
    return structuredClone(evalRec);
  }

  async listEvaluations(orgId: string, sessionId: string): Promise<StructuredEvaluation[]> {
    const session = this.sessions.get(sessionId);
    if (!session || session.orgId !== orgId) return [];
    const responseIds = new Set([...this.responses.values()].filter((r) => r.sessionId === sessionId).map((r) => r.id));
    return [...this.evaluations.values()].filter((e) => responseIds.has(e.responseId)).map((e) => structuredClone(e));
  }

  async addSkillEvidence(
    orgId: string,
    sessionId: string,
    candidateId: string,
    records: SkillEvidenceRecord[]
  ): Promise<void> {
    for (const record of records) {
      this.skillEvidence.push({ orgId, sessionId, candidateId, record: structuredClone(record) });
    }
  }

  async recordEvent(event: AuditEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async listSessionsForCandidate(orgId: string, candidateId: string): Promise<InterviewSession[]> {
    return [...this.sessions.values()]
      .filter((s) => s.orgId === orgId && s.candidateId === candidateId)
      .map((s) => structuredClone(s));
  }
}
