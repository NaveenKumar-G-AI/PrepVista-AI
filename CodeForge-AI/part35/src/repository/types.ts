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

export interface InterviewRepositoryPort {
  createBlueprint(bp: InterviewBlueprint): Promise<void>;
  getBlueprint(orgId: string, id: string): Promise<InterviewBlueprint | null>;

  createSession(session: InterviewSession): Promise<InterviewSession>;
  getSession(orgId: string, id: string): Promise<InterviewSession | null>;
  /** §39 idempotency + §37 state machine both live above this call; the repository just persists whatever valid state it's given. */
  updateSession(orgId: string, id: string, patch: Partial<InterviewSession> & { state: SessionState }): Promise<InterviewSession>;

  addQuestion(question: InterviewQuestion): Promise<InterviewQuestion>;
  getQuestion(orgId: string, id: string): Promise<InterviewQuestion | null>;
  listQuestions(orgId: string, sessionId: string): Promise<InterviewQuestion[]>;

  /** §39 — must be idempotent on (sessionId, idempotencyKey): a repeat call returns the original row, never a duplicate. */
  addResponseIdempotent(response: InterviewResponse): Promise<{ response: InterviewResponse; wasDuplicate: boolean }>;
  getResponse(orgId: string, id: string): Promise<InterviewResponse | null>;
  listResponses(orgId: string, sessionId: string): Promise<InterviewResponse[]>;

  /** Returns the persisted row — callers must not assume the id they passed in survived (Postgres assigns its own via DEFAULT). */
  addEvaluation(evaluation: StructuredEvaluation): Promise<StructuredEvaluation>;
  getEvaluationForResponse(orgId: string, responseId: string): Promise<StructuredEvaluation | null>;
  listEvaluations(orgId: string, sessionId: string): Promise<StructuredEvaluation[]>;

  addSkillEvidence(orgId: string, sessionId: string, candidateId: string, records: SkillEvidenceRecord[]): Promise<void>;

  recordEvent(event: AuditEvent): Promise<void>;

  /** §40 — every attempt stored independently; never overwritten. */
  listSessionsForCandidate(orgId: string, candidateId: string): Promise<InterviewSession[]>;
}
