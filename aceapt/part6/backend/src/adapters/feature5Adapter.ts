import { getDb, toJson, fromJson } from '../db/db';
import { PracticeHistorySample, PracticeSessionHandle, PracticeSessionRequest, Topic } from '../domain/types';
import { newId, nowIso } from '../utils/ids';
import { audit } from '../utils/logger';

/**
 * Boundary to Feature 5 (Adaptive Practice & Dynamic Challenge Engine).
 * Feature 6 does NOT own adaptive daily practice (section 5) - it only ever
 * (a) hands off a PracticeRecommendation and (b) reads back accuracy from
 * practice attempts, to compute the Practice-vs-Assessment Gap (section 25).
 * No Feature 5 repository was provided, so this is the adapter boundary
 * (section 53/38) with a persisted mock behind it.
 *
 * The mock DOES persist to SQLite (practice_sessions table) so a request
 * created via the API survives process restarts, but it never invents a
 * completion or an accuracy number on its own - recordPracticeCompletion
 * must be called explicitly (by a real Feature 5, or by the e2e demo script
 * simulating one) before getPracticeAccuracy returns anything.
 */
export interface PracticeEngineAdapter {
  requestPractice(request: PracticeSessionRequest): Promise<PracticeSessionHandle>;
  getPracticeAccuracy(studentId: string, topic: Topic, skill?: string): Promise<PracticeHistorySample | null>;
}

interface SimulatedPracticeResult {
  accuracyPct: number;
  sampleSize: number;
}

export class MockFeature5Adapter implements PracticeEngineAdapter {
  async requestPractice(request: PracticeSessionRequest): Promise<PracticeSessionHandle> {
    const db = getDb();
    const id = newId('practice');
    const createdAt = nowIso();
    db.prepare(
      `INSERT INTO practice_sessions (id, student_id, source_assessment_id, recommendation_json, status, created_at)
       VALUES (?, ?, ?, ?, 'CREATED', ?)`
    ).run(id, request.studentId, request.sourceAssessmentId, toJson(request.recommendation), createdAt);

    audit('PRACTICE_SESSION_REQUESTED', request.studentId, {
      practiceSessionId: id,
      topic: request.recommendation.topic,
      skill: request.recommendation.skill,
      objective: request.recommendation.objective,
    });

    return { practiceSessionId: id, status: 'CREATED', createdAt };
  }

  /** Demo/integration hook: simulates Feature 5 reporting the student finished practice. */
  async recordPracticeCompletion(practiceSessionId: string, result: SimulatedPracticeResult): Promise<void> {
    const db = getDb();
    db.prepare(
      `UPDATE practice_sessions SET status = 'COMPLETED', simulated_result_json = ?, completed_at = ? WHERE id = ?`
    ).run(toJson(result), nowIso(), practiceSessionId);
  }

  async getPracticeAccuracy(studentId: string, topic: Topic, skill?: string): Promise<PracticeHistorySample | null> {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT recommendation_json, simulated_result_json FROM practice_sessions
         WHERE student_id = ? AND status = 'COMPLETED' ORDER BY completed_at DESC`
      )
      .all(studentId) as { recommendation_json: string; simulated_result_json: string }[];

    const matches = rows
      .map((r) => ({
        rec: fromJson<{ topic: Topic; skill?: string }>(r.recommendation_json, { topic: 'ARITHMETIC' as Topic }),
        result: fromJson<SimulatedPracticeResult | null>(r.simulated_result_json, null),
      }))
      .filter((r) => r.result && r.rec.topic === topic && (!skill || r.rec.skill === skill));

    if (matches.length === 0) return null;

    const totalSamples = matches.reduce((sum, m) => sum + (m.result?.sampleSize ?? 0), 0);
    const weightedAccuracy =
      matches.reduce((sum, m) => sum + (m.result?.accuracyPct ?? 0) * (m.result?.sampleSize ?? 0), 0) /
      (totalSamples || 1);

    return {
      studentId,
      topic,
      skill,
      accuracyPct: Math.round(weightedAccuracy * 10) / 10,
      sampledFrom: 'FEATURE_5_PRACTICE',
      sampleSize: totalSamples,
    };
  }
}

export const feature5Adapter = new MockFeature5Adapter();
