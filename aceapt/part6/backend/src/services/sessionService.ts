import { getDb, fromJson, toJson } from '../db/db';
import { Assessment, AssessmentStatus } from '../domain/types';
import { nowIso } from '../utils/ids';
import { audit } from '../utils/logger';
import { computeEndsAt, isExpired } from './timerService';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
export class InvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}

function rowToAssessment(r: any): Assessment {
  return {
    id: r.id,
    studentId: r.student_id,
    type: r.type,
    blueprintId: r.blueprint_id,
    status: r.status,
    questionIds: fromJson(r.question_ids_json, []),
    durationSeconds: r.duration_seconds,
    startedAt: r.started_at,
    endsAt: r.ends_at,
    submittedAt: r.submitted_at,
    currentQuestionId: r.current_question_id,
    formLabel: r.form_label,
    createdAt: r.created_at,
  };
}

/** Fetches an assessment and verifies it belongs to studentId. Throws NotFoundError / ForbiddenError otherwise. */
export function getOwnedAssessment(assessmentId: string, studentId: string): Assessment {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM assessments WHERE id = ?`).get(assessmentId) as any;
  if (!row) throw new NotFoundError(`Assessment ${assessmentId} not found`);
  const assessment = rowToAssessment(row);
  if (assessment.studentId !== studentId) {
    throw new ForbiddenError('This assessment does not belong to the requesting student');
  }
  return assessment;
}

function setStatus(assessmentId: string, status: AssessmentStatus, extra: Record<string, unknown> = {}): void {
  const db = getDb();
  const fields = Object.keys(extra);
  const setClauses = ['status = @status', ...fields.map((f) => `${f} = @${f}`)];
  db.prepare(`UPDATE assessments SET ${setClauses.join(', ')} WHERE id = @id`).run({
    id: assessmentId,
    status,
    ...extra,
  });
}

export function startAssessment(assessmentId: string, studentId: string): Assessment {
  const assessment = getOwnedAssessment(assessmentId, studentId);
  if (assessment.status !== 'NOT_STARTED') {
    throw new InvalidStateError(`Cannot start an assessment in status ${assessment.status}`);
  }
  const startedAt = nowIso();
  const endsAt = computeEndsAt(startedAt, assessment.durationSeconds);
  const firstQuestionId = assessment.questionIds[0] ?? null;

  setStatus(assessmentId, 'IN_PROGRESS', {
    started_at: startedAt,
    ends_at: endsAt,
    current_question_id: firstQuestionId,
  });

  audit('ASSESSMENT_STARTED', studentId, { assessmentId, endsAt });

  return { ...assessment, status: 'IN_PROGRESS', startedAt, endsAt, currentQuestionId: firstQuestionId };
}

/**
 * Server-authoritative expiry guard. Call this at the top of every mutating
 * assessment route. If time is up and the assessment is still IN_PROGRESS,
 * this marks it EXPIRED so a client that simply stops calling never leaves
 * an assessment silently "stuck" (section 57: "Never silently lose student
 * attempts"). The actual scoring pass still runs against whatever attempts
 * exist - see routes/assessments.ts submit handler, which treats EXPIRED the
 * same as an explicit submit.
 */
export function checkExpiry(assessmentId: string, studentId: string): Assessment {
  const assessment = getOwnedAssessment(assessmentId, studentId);
  if (assessment.status === 'IN_PROGRESS' && isExpired(assessment)) {
    setStatus(assessmentId, 'EXPIRED');
    audit('ASSESSMENT_EXPIRED', studentId, { assessmentId });
    return { ...assessment, status: 'EXPIRED' };
  }
  return assessment;
}

export function requireInProgress(assessment: Assessment): void {
  if (assessment.status !== 'IN_PROGRESS') {
    throw new InvalidStateError(
      `Assessment is ${assessment.status}, not IN_PROGRESS - this action is not allowed right now.`
    );
  }
}

export function setCurrentQuestion(assessmentId: string, questionId: string): void {
  const db = getDb();
  db.prepare(`UPDATE assessments SET current_question_id = ? WHERE id = ?`).run(questionId, assessmentId);
}

export function markSubmitted(assessmentId: string, studentId: string): Assessment {
  const assessment = getOwnedAssessment(assessmentId, studentId);
  const submittedAt = nowIso();
  setStatus(assessmentId, 'SUBMITTED', { submitted_at: submittedAt });
  audit('ASSESSMENT_SUBMITTED', studentId, { assessmentId });
  return { ...assessment, status: 'SUBMITTED', submittedAt };
}

export function markCompleted(assessmentId: string): void {
  const db = getDb();
  db.prepare(`UPDATE assessments SET status = 'COMPLETED' WHERE id = ?`).run(assessmentId);
}

export function abandonAssessment(assessmentId: string, studentId: string): Assessment {
  const assessment = getOwnedAssessment(assessmentId, studentId);
  requireInProgress(assessment);
  setStatus(assessmentId, 'ABANDONED');
  audit('ASSESSMENT_ABANDONED', studentId, { assessmentId });
  return { ...assessment, status: 'ABANDONED' };
}
