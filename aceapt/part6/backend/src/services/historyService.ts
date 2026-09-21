import { getDb, fromJson, toJson } from '../db/db';
import { Topic } from '../domain/types';
import { newId } from '../utils/ids';

export interface ReadinessHistoryEntry {
  studentId: string;
  assessmentId: string;
  assessmentType: string;
  overallScore: number;
  accuracyPct: number;
  state: string;
  modelVersion: string;
  topicsCovered: Topic[];
  computedAt: string;
}

export function recordReadinessHistory(entry: ReadinessHistoryEntry): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO readiness_history
      (id, student_id, assessment_id, assessment_type, overall_score, accuracy_pct, state, model_version, topics_covered_json, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId('rh'),
    entry.studentId,
    entry.assessmentId,
    entry.assessmentType,
    entry.overallScore,
    entry.accuracyPct,
    entry.state,
    entry.modelVersion,
    toJson(entry.topicsCovered),
    entry.computedAt
  );
}

export function countCompletedAssessments(studentId: string): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as c FROM readiness_history WHERE student_id = ?`).get(studentId) as {
    c: number;
  };
  return row.c;
}

export function getReadinessHistory(studentId: string, limit = 20): ReadinessHistoryEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM readiness_history WHERE student_id = ? ORDER BY computed_at ASC LIMIT ?`
    )
    .all(studentId, limit) as any[];
  return rows.map((r) => ({
    studentId: r.student_id,
    assessmentId: r.assessment_id,
    assessmentType: r.assessment_type,
    overallScore: r.overall_score,
    accuracyPct: r.accuracy_pct,
    state: r.state,
    modelVersion: r.model_version,
    topicsCovered: fromJson<Topic[]>(r.topics_covered_json, []),
    computedAt: r.computed_at,
  }));
}

export interface AssessmentHistorySummary {
  assessmentId: string;
  type: string;
  status: string;
  overallScore: number | null;
  readinessState: string | null;
  accuracyPct: number | null;
  submittedAt: string | null;
  createdAt: string;
}

/** Section 40: "STUDENT VS THEIR PREVIOUS STATE" - full list for the history screen. */
export function getAssessmentHistory(studentId: string): AssessmentHistorySummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id as assessment_id, a.type, a.status, a.submitted_at, a.created_at,
              r.overall_readiness_score, r.readiness_state, r.result_json
       FROM assessments a
       LEFT JOIN assessment_results r ON r.assessment_id = a.id
       WHERE a.student_id = ?
       ORDER BY a.created_at ASC`
    )
    .all(studentId) as any[];

  return rows.map((r) => {
    const result = r.result_json ? fromJson<any>(r.result_json, null) : null;
    return {
      assessmentId: r.assessment_id,
      type: r.type,
      status: r.status,
      overallScore: r.overall_readiness_score ?? null,
      readinessState: r.readiness_state ?? null,
      accuracyPct: result?.accuracyPct ?? null,
      submittedAt: r.submitted_at,
      createdAt: r.created_at,
    };
  });
}
