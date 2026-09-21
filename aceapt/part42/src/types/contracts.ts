// Ports: every boundary where Feature 42 would touch a system this build
// could not inspect (no reachable ACEAPT repo this session — see
// TRUTH_TABLE.md). Each port has exactly one implementation here, a
// same-process in-memory/Postgres-backed one built for this reference
// delivery, clearly separated from "the real thing" so integrating this
// later means swapping the implementation, not rewriting the engine.

import type {
  Blueprint,
  DiagnosticQuestion,
  DiagnosticSession,
  QualityFlag,
  QuestionDifficulty,
  RawResponseInput,
  SkillEstimate,
  StudentDiagnosticProfile,
} from "./domain.js";

/** Stands in for ACEAPT's existing student/auth system (Module 41: this
 * build never implements auth — it expects a verified identity handed in). */
export interface StudentContext {
  tenantId: string;
  studentId: string;
}

/** Stands in for ACEAPT's existing question bank (Module 3: "if the
 * existing question model already contains these fields, reuse them"). */
export interface QuestionBankPort {
  getById(questionId: string): Promise<DiagnosticQuestion | null>;
  /** Candidate pool for a skill node, already filtered to quality_status='active'. */
  getCandidatesForSkill(skillNodeId: string, difficulty?: QuestionDifficulty): Promise<DiagnosticQuestion[]>;
}

/** Module 15: "Use existing Mistake Intelligence if available. Do NOT create
 * duplicate mistake classification systems." No such system was reachable
 * this session, so this port has one deterministic fallback implementation
 * (src/engine/errorSignals.ts) standing in for it. */
export interface MistakeIntelligencePort {
  classify(input: {
    isCorrect: boolean | null;
    hintUsed: boolean;
    durationMs: number;
    expectedDurationMs: number;
    difficulty: QuestionDifficulty;
    confidence?: number;
  }): Promise<string[]>; // e.g. ["rushing", "formula_misuse"] — signals, not verdicts
}

/** Module 39/40 — natural-language restating of an already-decided,
 * deterministic conclusion. MUST NOT be able to change a score or label;
 * the interface only accepts already-final evidence and returns prose. */
export interface ExplanationProvider {
  explain(input: {
    conclusion: string;
    supportingEvidence: string[];
    confidenceState: string;
  }): Promise<string>;
}

/** Persistence boundary. The Postgres implementation is the one exercised
 * by the RLS/concurrency integration tests; the in-memory one exists for
 * fast unit/archetype tests that don't need a real database. */
export interface DiagnosticRepository {
  getBlueprint(blueprintId: string): Promise<Blueprint | null>;

  startOrResumeSession(
    ctx: StudentContext,
    blueprintId: string,
    mode: string,
  ): Promise<{ session: DiagnosticSession; resumed: boolean }>;

  getSessionState(ctx: StudentContext, sessionId: string): Promise<DiagnosticSession | null>;

  saveWorkingState(ctx: StudentContext, sessionId: string, workingState: Record<string, unknown>): Promise<boolean>;

  submitResponse(
    ctx: StudentContext,
    sessionId: string,
    response: RawResponseInput,
    evidence: { evidenceWeight: number; timingClassification: string; qualityFlags: QualityFlag[] },
    updatedEstimates: SkillEstimate[],
  ): Promise<{ ok: true; duplicate: boolean; responseId: string } | { ok: false; reason: string }>;

  pauseSession(ctx: StudentContext, sessionId: string): Promise<{ ok: boolean; reason?: string }>;
  resumeSession(ctx: StudentContext, sessionId: string): Promise<{ ok: boolean; reason?: string }>;
  abandonOrExpireSession(
    ctx: StudentContext,
    sessionId: string,
    status: "abandoned" | "expired",
  ): Promise<{ ok: boolean; reason?: string }>;

  completeSession(
    ctx: StudentContext,
    sessionId: string,
    finalProfile: StudentDiagnosticProfile,
  ): Promise<{ ok: boolean; snapshotType?: string; reason?: string }>;

  startReassessment(
    ctx: StudentContext,
    blueprintId: string,
  ): Promise<{ ok: true; sessionId: string; baselineSessionId: string } | { ok: false; reason: string }>;

  getSkillEstimates(ctx: StudentContext, sessionId: string): Promise<SkillEstimate[]>;

  /** Every evidence row for the session, chronological — needed to correctly
   * recompute topic/domain-level estimates (which pool across sibling skills)
   * after any single response, not just the skill that was just answered.
   * Carries duration/difficulty/confidence too so the profile builder never
   * has to re-associate this back to a response by guesswork. */
  getSessionEvidenceRaw(
    ctx: StudentContext,
    sessionId: string,
  ): Promise<
    Array<{
      skillNodeId: string;
      isCorrect: boolean | null;
      evidenceWeight: number;
      createdAt: string;
      durationMs: number;
      expectedDurationMs: number;
      difficulty: QuestionDifficulty;
      confidence?: number;
    }>
  >;

  getLatestSnapshot(
    ctx: StudentContext,
    sessionId: string,
    snapshotType?: string,
  ): Promise<StudentDiagnosticProfile | null>;

  getBaselineVsCurrent(
    ctx: StudentContext,
    sessionId: string,
  ): Promise<{ current: StudentDiagnosticProfile | null; baseline: StudentDiagnosticProfile | null }>;

  getEvidenceTrail(ctx: StudentContext, skillNodeId: string, sessionId: string): Promise<unknown[]>;

  recordRecommendations(ctx: StudentContext, sessionId: string, recommendations: unknown[]): Promise<boolean>;
  getRecommendations(ctx: StudentContext, sessionId: string): Promise<unknown[]>;

  getQuestionExposure(ctx: StudentContext, questionId: string): Promise<number>;
}
