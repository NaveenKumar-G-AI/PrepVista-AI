import { getDb, fromJson, toJson } from '../db/db';
import { AttemptRecord, ExposureStatus, NavigationEvent } from '../domain/types';
import { nowIso } from '../utils/ids';
import { setCurrentQuestion } from './sessionService';

function rowToAttempt(r: any): AttemptRecord {
  return {
    assessmentId: r.assessment_id,
    questionId: r.question_id,
    firstViewedAt: r.first_viewed_at,
    firstAnsweredAt: r.first_answered_at,
    firstAnswer: r.first_answer,
    finalAnswer: r.final_answer,
    answerChangeCount: r.answer_change_count,
    correct: r.correct === null ? null : Boolean(r.correct),
    timeSpentMs: r.time_spent_ms,
    skipped: Boolean(r.skipped),
    revisited: Boolean(r.revisited),
    visitCount: r.visit_count,
    navigationLog: fromJson<NavigationEvent[]>(r.navigation_log_json, []),
  };
}

function ensureRow(assessmentId: string, questionId: string): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO attempts (assessment_id, question_id, navigation_log_json) VALUES (?, ?, '[]')`
  ).run(assessmentId, questionId);
}

function getRow(assessmentId: string, questionId: string): any {
  const db = getDb();
  return db.prepare(`SELECT * FROM attempts WHERE assessment_id = ? AND question_id = ?`).get(assessmentId, questionId);
}

function appendEvent(assessmentId: string, questionId: string, event: NavigationEvent): void {
  const db = getDb();
  const row = getRow(assessmentId, questionId);
  const log = fromJson<NavigationEvent[]>(row?.navigation_log_json, []);
  log.push(event);
  db.prepare(`UPDATE attempts SET navigation_log_json = ? WHERE assessment_id = ? AND question_id = ?`).run(
    toJson(log),
    assessmentId,
    questionId
  );
}

function upsertExposure(studentId: string, questionId: string, addStatus: ExposureStatus): void {
  const db = getDb();
  const existing = db
    .prepare(`SELECT * FROM question_exposure WHERE student_id = ? AND question_id = ?`)
    .get(studentId, questionId) as any;
  const now = nowIso();

  if (!existing) {
    db.prepare(
      `INSERT INTO question_exposure (student_id, question_id, statuses_json, times_seen, times_correct, times_incorrect, last_seen_at)
       VALUES (?, ?, ?, 1, 0, 0, ?)`
    ).run(studentId, questionId, toJson([addStatus]), now);
    return;
  }

  const statuses = new Set(fromJson<ExposureStatus[]>(existing.statuses_json, []));
  statuses.add(addStatus);
  db.prepare(
    `UPDATE question_exposure SET statuses_json = ?, times_seen = times_seen + 1, last_seen_at = ? WHERE student_id = ? AND question_id = ?`
  ).run(toJson([...statuses]), now, studentId, questionId);
}

/**
 * Closes the currently-open viewing interval for `questionId` (if any) by
 * accumulating elapsed server time into time_spent_ms. This is the mechanism
 * that makes "time spent per question" server-authoritative: it is derived
 * entirely from when the server itself received navigate/view/submit calls,
 * never from a client-reported duration (section 16/45).
 */
function closeOpenInterval(assessmentId: string, questionId: string): void {
  const db = getDb();
  const row = getRow(assessmentId, questionId);
  if (!row || !row.current_interval_started_at) return;
  const elapsedMs = Math.max(0, Date.now() - Date.parse(row.current_interval_started_at));
  db.prepare(
    `UPDATE attempts SET time_spent_ms = time_spent_ms + ?, current_interval_started_at = NULL
     WHERE assessment_id = ? AND question_id = ?`
  ).run(elapsedMs, assessmentId, questionId);
}

function openInterval(assessmentId: string, questionId: string): void {
  const db = getDb();
  db.prepare(`UPDATE attempts SET current_interval_started_at = ? WHERE assessment_id = ? AND question_id = ?`).run(
    nowIso(),
    assessmentId,
    questionId
  );
}

/**
 * Called whenever the student navigates to a question (including the very
 * first question at assessment start). Closes the previous question's timing
 * interval, opens a new one, and updates exposure/visit bookkeeping.
 */
export function viewQuestion(
  assessmentId: string,
  studentId: string,
  questionId: string,
  previousQuestionId: string | null
): void {
  const db = getDb();

  if (previousQuestionId && previousQuestionId !== questionId) {
    closeOpenInterval(assessmentId, previousQuestionId);
    appendEvent(assessmentId, previousQuestionId, { type: 'LEAVE', at: nowIso() });
  }

  ensureRow(assessmentId, questionId);
  const row = getRow(assessmentId, questionId);
  const isRevisit = row.visit_count > 0;
  const now = nowIso();

  db.prepare(
    `UPDATE attempts SET
       first_viewed_at = COALESCE(first_viewed_at, ?),
       visit_count = visit_count + 1,
       revisited = CASE WHEN visit_count > 0 THEN 1 ELSE revisited END
     WHERE assessment_id = ? AND question_id = ?`
  ).run(now, assessmentId, questionId);

  appendEvent(assessmentId, questionId, { type: isRevisit ? 'RETURN' : 'VIEW', at: now });
  openInterval(assessmentId, questionId);
  setCurrentQuestion(assessmentId, questionId);

  upsertExposure(studentId, questionId, 'SEEN');
}

export function submitAnswer(assessmentId: string, questionId: string, optionId: string): AttemptRecord {
  ensureRow(assessmentId, questionId);
  const db = getDb();
  const row = getRow(assessmentId, questionId);
  const now = nowIso();

  const isChange = row.final_answer !== null && row.final_answer !== optionId;

  db.prepare(
    `UPDATE attempts SET
       first_answer = COALESCE(first_answer, ?),
       first_answered_at = COALESCE(first_answered_at, ?),
       final_answer = ?,
       answer_change_count = answer_change_count + ?,
       skipped = 0
     WHERE assessment_id = ? AND question_id = ?`
  ).run(optionId, now, optionId, isChange ? 1 : 0, assessmentId, questionId);

  appendEvent(assessmentId, questionId, { type: isChange ? 'ANSWER_CHANGE' : 'ANSWER', at: now, value: optionId });

  return rowToAttempt(getRow(assessmentId, questionId));
}

export function skipQuestion(assessmentId: string, questionId: string): AttemptRecord {
  ensureRow(assessmentId, questionId);
  const db = getDb();
  db.prepare(`UPDATE attempts SET skipped = 1 WHERE assessment_id = ? AND question_id = ?`).run(
    assessmentId,
    questionId
  );
  appendEvent(assessmentId, questionId, { type: 'SKIP', at: nowIso() });
  return rowToAttempt(getRow(assessmentId, questionId));
}

/** Closes whatever interval is currently open - call right before scoring so the last-viewed question's time counts. */
export function finalizeOpenIntervals(assessmentId: string, currentQuestionId: string | null): void {
  if (currentQuestionId) closeOpenInterval(assessmentId, currentQuestionId);
}

export function getAttempt(assessmentId: string, questionId: string): AttemptRecord | null {
  const row = getRow(assessmentId, questionId);
  return row ? rowToAttempt(row) : null;
}

export function getAllAttempts(assessmentId: string): AttemptRecord[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM attempts WHERE assessment_id = ?`).all(assessmentId) as any[];
  return rows.map(rowToAttempt);
}

/** Marks final scored correctness onto each attempt row (called once, at submit time, by scoringService). */
export function persistCorrectness(assessmentId: string, results: { questionId: string; correct: boolean }[]): void {
  const db = getDb();
  const stmt = db.prepare(`UPDATE attempts SET correct = ? WHERE assessment_id = ? AND question_id = ?`);
  const txn = db.transaction((rs: typeof results) => {
    for (const r of rs) stmt.run(r.correct ? 1 : 0, assessmentId, r.questionId);
  });
  txn(results);
}

export function updateExposureAfterScoring(
  studentId: string,
  results: { questionId: string; correct: boolean }[]
): void {
  const db = getDb();
  for (const r of results) {
    const existing = db
      .prepare(`SELECT * FROM question_exposure WHERE student_id = ? AND question_id = ?`)
      .get(studentId, r.questionId) as any;
    if (!existing) continue; // should have been created by upsertExposure during viewQuestion

    const statuses = new Set(fromJson<ExposureStatus[]>(existing.statuses_json, []));
    statuses.add(r.correct ? 'CORRECT' : 'INCORRECT');
    statuses.add('ATTEMPTED');

    const newCorrect = existing.times_correct + (r.correct ? 1 : 0);
    const newIncorrect = existing.times_incorrect + (r.correct ? 0 : 1);

    if (newCorrect >= 2 && newIncorrect === 0) statuses.add('REPEATEDLY_SUCCESSFUL');
    if (newIncorrect >= 2 && newCorrect === 0) statuses.add('REPEATEDLY_FAILED');
    if (newCorrect >= 2 && newIncorrect === 0) statuses.add('MASTERED');

    db.prepare(
      `UPDATE question_exposure SET statuses_json = ?, times_correct = ?, times_incorrect = ? WHERE student_id = ? AND question_id = ?`
    ).run(toJson([...statuses]), newCorrect, newIncorrect, studentId, r.questionId);
  }
}
