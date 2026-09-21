import { getDb, newId, nowIso } from "./client";
import type {
  ConfidenceLevel,
  ConfidenceSelfRating,
  Domain,
  OnboardingContext,
  PainPoint,
  Question,
  QuestionPresentation,
  QuestionPurpose,
  ResponseRecord,
  ResponseStatus,
  DiagnosticSession,
  DiagnosticStatus,
  SkillNode,
  SourceType,
  ApplicationType,
  ValidationStatus,
} from "@/lib/domain/types";
import type { SeedQuestion } from "@/data/seed/questions";

// -----------------------------------------------------------------------------
// Students (lightweight — see lib/auth/demoAuth.ts for why this exists)
// -----------------------------------------------------------------------------

export function ensureStudent(id: string): void {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM students WHERE id = ?").get(id);
  if (!existing) {
    db.prepare("INSERT INTO students (id, created_at) VALUES (?, ?)").run(id, nowIso());
  }
}

// -----------------------------------------------------------------------------
// Onboarding contexts (Feature 1 output contract)
// -----------------------------------------------------------------------------

export interface CreateOnboardingContextInput {
  studentId: string;
  preparationGoal: string;
  targetDate: string | null;
  timelineCategory: OnboardingContext["timelineCategory"];
  daysAvailable: number | null;
  experienceLevel: OnboardingContext["experienceLevel"];
  previousPreparation: string | null;
  confidenceQuantitative: ConfidenceSelfRating;
  confidenceLogical: ConfidenceSelfRating;
  confidenceVerbal: ConfidenceSelfRating;
  confidenceTimePressure: ConfidenceSelfRating;
  primaryPainPoint: PainPoint;
  secondaryPainPoints: PainPoint[];
}

export function createOnboardingContext(input: CreateOnboardingContextInput): OnboardingContext {
  const db = getDb();
  const id = newId("onb");
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO onboarding_contexts
      (id, student_id, version, preparation_goal, target_date, timeline_category, days_available,
       experience_level, previous_preparation, confidence_quantitative, confidence_logical,
       confidence_verbal, confidence_time_pressure, primary_pain_point, secondary_pain_points, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.studentId,
    input.preparationGoal,
    input.targetDate,
    input.timelineCategory,
    input.daysAvailable,
    input.experienceLevel,
    input.previousPreparation,
    input.confidenceQuantitative,
    input.confidenceLogical,
    input.confidenceVerbal,
    input.confidenceTimePressure,
    input.primaryPainPoint,
    JSON.stringify(input.secondaryPainPoints),
    createdAt
  );
  return getOnboardingContext(id)!;
}

export function getOnboardingContext(id: string): OnboardingContext | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM onboarding_contexts WHERE id = ?").get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    version: row.version,
    createdAt: row.created_at,
    preparationGoal: row.preparation_goal,
    targetDate: row.target_date,
    timelineCategory: row.timeline_category,
    daysAvailable: row.days_available,
    experienceLevel: row.experience_level,
    previousPreparation: row.previous_preparation,
    confidenceQuantitative: row.confidence_quantitative,
    confidenceLogical: row.confidence_logical,
    confidenceVerbal: row.confidence_verbal,
    confidenceTimePressure: row.confidence_time_pressure,
    primaryPainPoint: row.primary_pain_point,
    secondaryPainPoints: JSON.parse(row.secondary_pain_points),
  };
}

// -----------------------------------------------------------------------------
// Skill hierarchy
// -----------------------------------------------------------------------------

export function upsertSkill(skill: SkillNode): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO skill_nodes (id, domain, topic, subtopic, concept, display_name, description, prerequisite_skill_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       domain=excluded.domain, topic=excluded.topic, subtopic=excluded.subtopic,
       concept=excluded.concept, display_name=excluded.display_name,
       description=excluded.description, prerequisite_skill_id=excluded.prerequisite_skill_id`
  ).run(
    skill.id,
    skill.domain,
    skill.topic,
    skill.subtopic,
    skill.concept,
    skill.displayName,
    skill.description,
    skill.prerequisiteSkillId
  );
}

export function getAllSkills(): SkillNode[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM skill_nodes").all() as any[];
  return rows.map(rowToSkill);
}

export function getSkill(id: string): SkillNode | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM skill_nodes WHERE id = ?").get(id) as any;
  return row ? rowToSkill(row) : null;
}

function rowToSkill(row: any): SkillNode {
  return {
    id: row.id,
    domain: row.domain,
    topic: row.topic,
    subtopic: row.subtopic,
    concept: row.concept,
    displayName: row.display_name,
    description: row.description,
    prerequisiteSkillId: row.prerequisite_skill_id,
  };
}

// -----------------------------------------------------------------------------
// Questions
// -----------------------------------------------------------------------------

export function upsertQuestion(
  q: SeedQuestion,
  validationStatus: ValidationStatus,
  validationNotes: string | null
): void {
  const db = getDb();
  const now = nowIso();
  const existing = db.prepare("SELECT id FROM questions WHERE id = ?").get(q.id);
  if (existing) {
    db.prepare(
      `UPDATE questions SET version=?, skill_node_id=?, application_type=?, difficulty=?, question_type=?,
        question_text=?, options=?, correct_answer=?, explanation=?, expected_reasoning=?,
        common_error_types=?, skill_tags=?, estimated_time_seconds=?, validation_status=?,
        validation_notes=?, source_type=?, updated_at=? WHERE id=?`
    ).run(
      q.version,
      q.skillNodeId,
      q.applicationType,
      q.difficulty,
      q.questionType,
      q.questionText,
      JSON.stringify(q.options),
      q.correctAnswer,
      q.explanation,
      q.expectedReasoning,
      JSON.stringify(q.commonErrorTypes),
      JSON.stringify(q.skillTags),
      q.estimatedTimeSeconds,
      validationStatus,
      validationNotes,
      q.sourceType,
      now,
      q.id
    );
  } else {
    db.prepare(
      `INSERT INTO questions (id, version, skill_node_id, application_type, difficulty, question_type,
        question_text, options, correct_answer, explanation, expected_reasoning, common_error_types,
        skill_tags, estimated_time_seconds, validation_status, validation_notes, source_type,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      q.id,
      q.version,
      q.skillNodeId,
      q.applicationType,
      q.difficulty,
      q.questionType,
      q.questionText,
      JSON.stringify(q.options),
      q.correctAnswer,
      q.explanation,
      q.expectedReasoning,
      JSON.stringify(q.commonErrorTypes),
      JSON.stringify(q.skillTags),
      q.estimatedTimeSeconds,
      validationStatus,
      validationNotes,
      q.sourceType,
      now,
      now
    );
  }
}

export function getValidatedQuestions(): Question[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM questions WHERE validation_status = 'VALIDATED'").all() as any[];
  return rows.map(rowToQuestion);
}

export function getQuestion(id: string): Question | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM questions WHERE id = ?").get(id) as any;
  return row ? rowToQuestion(row) : null;
}

export function getAllQuestionsRaw(): Question[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM questions").all() as any[];
  return rows.map(rowToQuestion);
}

function rowToQuestion(row: any): Question {
  return {
    id: row.id,
    version: row.version,
    skillNodeId: row.skill_node_id,
    applicationType: row.application_type as ApplicationType,
    difficulty: row.difficulty,
    questionType: row.question_type,
    questionText: row.question_text,
    options: JSON.parse(row.options),
    correctAnswer: row.correct_answer,
    explanation: row.explanation,
    expectedReasoning: row.expected_reasoning,
    commonErrorTypes: JSON.parse(row.common_error_types),
    skillTags: JSON.parse(row.skill_tags),
    estimatedTimeSeconds: row.estimated_time_seconds,
    validationStatus: row.validation_status as ValidationStatus,
    validationNotes: row.validation_notes,
    sourceType: row.source_type as SourceType,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// -----------------------------------------------------------------------------
// Diagnostic sessions
// -----------------------------------------------------------------------------

export function createSession(input: {
  studentId: string;
  onboardingContextId: string;
  onboardingContextVersion: number;
}): DiagnosticSession {
  const db = getDb();
  const id = newId("diag");
  const now = nowIso();
  db.prepare(
    `INSERT INTO diagnostic_sessions
      (id, student_id, onboarding_context_id, onboarding_context_version, diagnostic_version, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 'IN_PROGRESS', ?, ?)`
  ).run(id, input.studentId, input.onboardingContextId, input.onboardingContextVersion, now, now);
  return getSession(id)!;
}

export function getSession(id: string): DiagnosticSession | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM diagnostic_sessions WHERE id = ?").get(id) as any;
  return row ? rowToSession(row) : null;
}

export function getLatestSessionForStudent(studentId: string): DiagnosticSession | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM diagnostic_sessions WHERE student_id = ? ORDER BY started_at DESC LIMIT 1")
    .get(studentId) as any;
  return row ? rowToSession(row) : null;
}

export function updateSessionStatus(
  id: string,
  status: DiagnosticStatus,
  extra?: { completedAt?: string; stopReason?: string }
): void {
  const db = getDb();
  db.prepare(
    `UPDATE diagnostic_sessions SET status=?, updated_at=?, completed_at=COALESCE(?, completed_at), stop_reason=COALESCE(?, stop_reason) WHERE id=?`
  ).run(status, nowIso(), extra?.completedAt ?? null, extra?.stopReason ?? null, id);
}

function rowToSession(row: any): DiagnosticSession {
  return {
    id: row.id,
    studentId: row.student_id,
    onboardingContextId: row.onboarding_context_id,
    onboardingContextVersion: row.onboarding_context_version,
    diagnosticVersion: row.diagnostic_version,
    status: row.status,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    stopReason: row.stop_reason,
  };
}

// -----------------------------------------------------------------------------
// Question presentations (the "why was this question asked" event)
// -----------------------------------------------------------------------------

export function createPresentation(input: {
  sessionId: string;
  questionId: string;
  purpose: QuestionPurpose;
  rationale: string;
  sequenceIndex: number;
  captureConfidence: boolean;
}): QuestionPresentation {
  const db = getDb();
  const id = newId("pres");
  const presentedAt = nowIso();
  db.prepare(
    `INSERT INTO question_presentations
      (id, session_id, question_id, purpose, rationale, sequence_index, capture_confidence, presented_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.sessionId,
    input.questionId,
    input.purpose,
    input.rationale,
    input.sequenceIndex,
    input.captureConfidence ? 1 : 0,
    presentedAt
  );
  return {
    id,
    sessionId: input.sessionId,
    questionId: input.questionId,
    purpose: input.purpose,
    rationale: input.rationale,
    sequenceIndex: input.sequenceIndex,
    captureConfidence: input.captureConfidence,
    presentedAt,
  };
}

export function getPresentation(id: string): QuestionPresentation | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM question_presentations WHERE id = ?").get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    questionId: row.question_id,
    purpose: row.purpose,
    rationale: row.rationale,
    sequenceIndex: row.sequence_index,
    captureConfidence: !!row.capture_confidence,
    presentedAt: row.presented_at,
  };
}

/** The most recent presentation in a session that has no matching response yet. */
export function getOpenPresentation(sessionId: string): QuestionPresentation | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT qp.* FROM question_presentations qp
       LEFT JOIN responses r ON r.presentation_id = qp.id
       WHERE qp.session_id = ? AND r.id IS NULL
       ORDER BY qp.sequence_index DESC LIMIT 1`
    )
    .get(sessionId) as any;
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    questionId: row.question_id,
    purpose: row.purpose,
    rationale: row.rationale,
    sequenceIndex: row.sequence_index,
    captureConfidence: !!row.capture_confidence,
    presentedAt: row.presented_at,
  };
}

export function countPresentations(sessionId: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as c FROM question_presentations WHERE session_id = ?")
    .get(sessionId) as any;
  return row.c as number;
}

// -----------------------------------------------------------------------------
// Responses
// -----------------------------------------------------------------------------

export interface CreateResponseInput {
  sessionId: string;
  presentationId: string;
  questionId: string;
  status: ResponseStatus;
  studentAnswer: string | null;
  isCorrect: boolean | null;
  confidenceLevel: ConfidenceLevel | null;
  questionStartedAt: string;
  questionAnsweredAt: string;
  responseDurationMs: number;
}

export function createResponse(input: CreateResponseInput): ResponseRecord {
  const db = getDb();
  const id = newId("resp");
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO responses
      (id, session_id, presentation_id, question_id, status, student_answer, is_correct,
       confidence_level, question_started_at, question_answered_at, response_duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.sessionId,
    input.presentationId,
    input.questionId,
    input.status,
    input.studentAnswer,
    input.isCorrect === null ? null : input.isCorrect ? 1 : 0,
    input.confidenceLevel,
    input.questionStartedAt,
    input.questionAnsweredAt,
    input.responseDurationMs,
    createdAt
  );
  return {
    id,
    sessionId: input.sessionId,
    presentationId: input.presentationId,
    questionId: input.questionId,
    status: input.status,
    studentAnswer: input.studentAnswer,
    isCorrect: input.isCorrect,
    confidenceLevel: input.confidenceLevel,
    questionStartedAt: input.questionStartedAt,
    questionAnsweredAt: input.questionAnsweredAt,
    responseDurationMs: input.responseDurationMs,
    createdAt,
  };
}

export function getResponseByPresentation(presentationId: string): ResponseRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM responses WHERE presentation_id = ?").get(presentationId) as any;
  return row ? rowToResponse(row) : null;
}

/**
 * The full response history for a session, joined with question metadata.
 * This is the raw material capabilityState.ts derives everything from.
 */
export interface JoinedAttempt {
  response: ResponseRecord;
  presentation: QuestionPresentation;
  question: Question;
}

export function getSessionHistory(sessionId: string): JoinedAttempt[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        r.id as r_id, r.session_id as r_session_id, r.presentation_id as r_presentation_id,
        r.question_id as r_question_id, r.status as r_status, r.student_answer as r_student_answer,
        r.is_correct as r_is_correct, r.confidence_level as r_confidence_level,
        r.question_started_at as r_question_started_at, r.question_answered_at as r_question_answered_at,
        r.response_duration_ms as r_response_duration_ms, r.created_at as r_created_at,
        qp.id as p_id, qp.purpose as p_purpose, qp.rationale as p_rationale,
        qp.sequence_index as p_sequence_index, qp.capture_confidence as p_capture_confidence,
        qp.presented_at as p_presented_at,
        q.*
       FROM responses r
       JOIN question_presentations qp ON qp.id = r.presentation_id
       JOIN questions q ON q.id = r.question_id
       WHERE r.session_id = ?
       ORDER BY qp.sequence_index ASC`
    )
    .all(sessionId) as any[];

  return rows.map((row) => ({
    response: {
      id: row.r_id,
      sessionId: row.r_session_id,
      presentationId: row.r_presentation_id,
      questionId: row.r_question_id,
      status: row.r_status,
      studentAnswer: row.r_student_answer,
      isCorrect: row.r_is_correct === null ? null : !!row.r_is_correct,
      confidenceLevel: row.r_confidence_level,
      questionStartedAt: row.r_question_started_at,
      questionAnsweredAt: row.r_question_answered_at,
      responseDurationMs: row.r_response_duration_ms,
      createdAt: row.r_created_at,
    },
    presentation: {
      id: row.p_id,
      sessionId: row.r_session_id,
      questionId: row.r_question_id,
      purpose: row.p_purpose,
      rationale: row.p_rationale,
      sequenceIndex: row.p_sequence_index,
      captureConfidence: !!row.p_capture_confidence,
      presentedAt: row.p_presented_at,
    },
    question: rowToQuestion(row),
  }));
}

function rowToResponse(row: any): ResponseRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    presentationId: row.presentation_id,
    questionId: row.question_id,
    status: row.status,
    studentAnswer: row.student_answer,
    isCorrect: row.is_correct === null ? null : !!row.is_correct,
    confidenceLevel: row.confidence_level,
    questionStartedAt: row.question_started_at,
    questionAnsweredAt: row.question_answered_at,
    responseDurationMs: row.response_duration_ms,
    createdAt: row.created_at,
  };
}

// -----------------------------------------------------------------------------
// Diagnostic results
// -----------------------------------------------------------------------------

export function saveDiagnosticResult(sessionId: string, resultJson: string, aiStatus: string, versions: {
  diagnosticVersion: number;
  scoringVersion: number;
  algorithmVersion: number;
}): void {
  const db = getDb();
  const id = newId("result");
  const completedAt = nowIso();
  db.prepare(
    `INSERT INTO diagnostic_results
      (id, session_id, result_json, ai_generation_status, diagnostic_version, scoring_version, algorithm_version, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       result_json=excluded.result_json, ai_generation_status=excluded.ai_generation_status,
       completed_at=excluded.completed_at`
  ).run(
    id,
    sessionId,
    resultJson,
    aiStatus,
    versions.diagnosticVersion,
    versions.scoringVersion,
    versions.algorithmVersion,
    completedAt
  );
}

export function getDiagnosticResultJson(sessionId: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT result_json FROM diagnostic_results WHERE session_id = ?").get(sessionId) as any;
  return row ? (row.result_json as string) : null;
}

// -----------------------------------------------------------------------------
// Analytics (structured event log — not a full pipeline, see README)
// -----------------------------------------------------------------------------

export function logEvent(eventType: string, sessionId: string | null, studentId: string | null, payload: unknown): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO analytics_events (id, session_id, student_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId("evt"), sessionId, studentId, eventType, JSON.stringify(payload ?? {}), nowIso());
}
