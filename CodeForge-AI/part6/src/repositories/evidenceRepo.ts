import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { EvidenceEvent, EvidenceOutcome, MasteryState } from '../domain/types';
import { applyEvidence, emptyMasteryState } from '../engine/masteryUpdate';

/**
 * Appends one immutable evidence row, then recomputes and persists the
 * materialized mastery state for that (student, skill) pair. This is the
 * only place mastery state is ever written — it is always derived from
 * evidence, never set directly (Phase: "do not allow clients to directly
 * modify mastery/readiness").
 */
export function recordEvidence(db: Database.Database, ev: EvidenceEvent): MasteryState {
  const id = ev.id ?? randomUUID();
  db.prepare(
    `INSERT INTO skill_evidence (id, student_id, skill_id, source, challenge_ref, outcome, independent, difficulty, language, failure_category, time_taken_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    ev.studentId,
    ev.skillId,
    ev.source,
    ev.challengeRef ?? null,
    ev.outcome,
    ev.independent ? 1 : 0,
    ev.difficulty ?? null,
    ev.language ?? null,
    ev.failureCategory ?? null,
    ev.timeTakenSeconds ?? null
  );

  const current = getMasteryState(db, ev.studentId, ev.skillId) ?? emptyMasteryState(ev.studentId, ev.skillId);
  const next = applyEvidence(current, { ...ev, id, createdAt: new Date().toISOString() });
  persistMasteryState(db, next);
  return next;
}

function persistMasteryState(db: Database.Database, state: MasteryState) {
  db.prepare(
    `INSERT INTO skill_mastery_state (student_id, skill_id, mastery_level, confidence, evidence_count, trend, recent_outcomes, last_evidence_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, skill_id) DO UPDATE SET
       mastery_level=excluded.mastery_level, confidence=excluded.confidence, evidence_count=excluded.evidence_count,
       trend=excluded.trend, recent_outcomes=excluded.recent_outcomes, last_evidence_at=excluded.last_evidence_at,
       updated_at = datetime('now')`
  ).run(
    state.studentId,
    state.skillId,
    state.masteryLevel,
    state.confidence,
    state.evidenceCount,
    state.trend,
    JSON.stringify(state.recentOutcomes),
    state.lastEvidenceAt
  );
}

export function getMasteryState(db: Database.Database, studentId: string, skillId: string): MasteryState | undefined {
  const row = db
    .prepare(
      `SELECT student_id, skill_id, mastery_level, confidence, evidence_count, trend, recent_outcomes, last_evidence_at
       FROM skill_mastery_state WHERE student_id = ? AND skill_id = ?`
    )
    .get(studentId, skillId) as
    | {
        student_id: string;
        skill_id: string;
        mastery_level: MasteryState['masteryLevel'];
        confidence: number;
        evidence_count: number;
        trend: MasteryState['trend'];
        recent_outcomes: string;
        last_evidence_at: string | null;
      }
    | undefined;
  if (!row) return undefined;
  return {
    studentId: row.student_id,
    skillId: row.skill_id,
    masteryLevel: row.mastery_level,
    confidence: row.confidence,
    evidenceCount: row.evidence_count,
    trend: row.trend,
    recentOutcomes: JSON.parse(row.recent_outcomes) as EvidenceOutcome[],
    lastEvidenceAt: row.last_evidence_at,
  };
}

export function getAllMasteryStates(db: Database.Database, studentId: string): Map<string, MasteryState> {
  const rows = db
    .prepare(
      `SELECT student_id, skill_id, mastery_level, confidence, evidence_count, trend, recent_outcomes, last_evidence_at
       FROM skill_mastery_state WHERE student_id = ?`
    )
    .all(studentId) as Array<{
    student_id: string;
    skill_id: string;
    mastery_level: MasteryState['masteryLevel'];
    confidence: number;
    evidence_count: number;
    trend: MasteryState['trend'];
    recent_outcomes: string;
    last_evidence_at: string | null;
  }>;
  const map = new Map<string, MasteryState>();
  for (const r of rows) {
    map.set(r.skill_id, {
      studentId: r.student_id,
      skillId: r.skill_id,
      masteryLevel: r.mastery_level,
      confidence: r.confidence,
      evidenceCount: r.evidence_count,
      trend: r.trend,
      recentOutcomes: JSON.parse(r.recent_outcomes) as EvidenceOutcome[],
      lastEvidenceAt: r.last_evidence_at,
    });
  }
  return map;
}

export function getEvidenceForSkill(db: Database.Database, studentId: string, skillId: string): EvidenceEvent[] {
  const rows = db
    .prepare(
      `SELECT id, student_id, skill_id, source, challenge_ref, outcome, independent, difficulty, language, failure_category, time_taken_seconds, created_at
       FROM skill_evidence WHERE student_id = ? AND skill_id = ? ORDER BY created_at ASC`
    )
    .all(studentId, skillId) as Array<Record<string, unknown>>;
  return rows.map(rowToEvidence);
}

export function getAllEvidence(db: Database.Database, studentId: string): EvidenceEvent[] {
  const rows = db
    .prepare(
      `SELECT id, student_id, skill_id, source, challenge_ref, outcome, independent, difficulty, language, failure_category, time_taken_seconds, created_at
       FROM skill_evidence WHERE student_id = ? ORDER BY created_at ASC`
    )
    .all(studentId) as Array<Record<string, unknown>>;
  return rows.map(rowToEvidence);
}

export function hasRecentVerificationPass(db: Database.Database, studentId: string, withinDays = 30): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM skill_evidence
       WHERE student_id = ? AND source = 'VERIFICATION' AND independent = 1 AND outcome = 'SUCCESS'
       AND created_at >= datetime('now', ?)`
    )
    .get(studentId, `-${withinDays} days`) as { cnt: number };
  return row.cnt > 0;
}

function rowToEvidence(r: Record<string, unknown>): EvidenceEvent {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    skillId: r.skill_id as string,
    source: r.source as EvidenceEvent['source'],
    challengeRef: (r.challenge_ref as string | null) ?? undefined,
    outcome: r.outcome as EvidenceEvent['outcome'],
    independent: r.independent === 1,
    difficulty: (r.difficulty as string | null) ?? undefined,
    language: (r.language as string | null) ?? undefined,
    failureCategory: (r.failure_category as EvidenceEvent['failureCategory'] | null) ?? undefined,
    timeTakenSeconds: (r.time_taken_seconds as number | null) ?? undefined,
    createdAt: r.created_at as string,
  };
}
