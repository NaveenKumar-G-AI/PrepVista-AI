import { getDb, newId, nowIso } from "./index";
import type {
  ExecutionSessionRecord,
  ExecutionSessionPhase,
  ActionEvidenceRecord,
  ActionOutcomeRecord,
  ExecutionBlockerRecord,
  EvidenceQuality,
  ActionImpact,
  BlockerReasonCode,
} from "../types";

// ---------- sessions ----------

function rowToSession(r: any): ExecutionSessionRecord {
  return {
    id: r.id,
    actionId: r.action_id,
    userId: r.user_id,
    plannedMinutes: r.planned_minutes,
    actualMinutes: r.actual_minutes,
    phases: safeParse(r.phases, []),
    startedAt: r.started_at,
    endedAt: r.ended_at,
  };
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function createSession(
  userId: string,
  actionId: string,
  plannedMinutes: number,
  phases: ExecutionSessionPhase[]
): ExecutionSessionRecord {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO execution_sessions (id, action_id, user_id, planned_minutes, phases) VALUES (?, ?, ?, ?, ?)`
  ).run(id, actionId, userId, plannedMinutes, JSON.stringify(phases));
  return rowToSession(db.prepare(`SELECT * FROM execution_sessions WHERE id = ?`).get(id));
}

export function endSession(userId: string, id: string, actualMinutes: number): void {
  getDb()
    .prepare(
      `UPDATE execution_sessions SET actual_minutes = ?, ended_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(actualMinutes, nowIso(), id, userId);
}

export function getSessionById(userId: string, id: string): ExecutionSessionRecord | undefined {
  const row = getDb().prepare(`SELECT * FROM execution_sessions WHERE id = ? AND user_id = ?`).get(id, userId);
  return row ? rowToSession(row) : undefined;
}

export function getLatestSessionForAction(
  userId: string,
  actionId: string
): ExecutionSessionRecord | undefined {
  const row = getDb()
    .prepare(
      `SELECT * FROM execution_sessions WHERE user_id = ? AND action_id = ? ORDER BY started_at DESC LIMIT 1`
    )
    .get(userId, actionId);
  return row ? rowToSession(row) : undefined;
}

export function listCompletedSessionsForActionType(
  userId: string,
  limit = 20
): ExecutionSessionRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM execution_sessions WHERE user_id = ? AND actual_minutes IS NOT NULL
       ORDER BY started_at DESC LIMIT ?`
    )
    .all(userId, limit);
  return rows.map(rowToSession);
}

// ---------- evidence ----------

function rowToEvidence(r: any): ActionEvidenceRecord {
  return {
    id: r.id,
    actionId: r.action_id,
    userId: r.user_id,
    evidenceQuality: r.evidence_quality,
    resultSummary: r.result_summary,
    scoreValue: r.score_value,
    scoreLabel: r.score_label,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export function createEvidence(input: {
  userId: string;
  actionId: string;
  evidenceQuality: EvidenceQuality;
  resultSummary?: string | null;
  scoreValue?: number | null;
  scoreLabel?: string | null;
  notes?: string | null;
}): ActionEvidenceRecord {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO action_evidence (id, action_id, user_id, evidence_quality, result_summary, score_value, score_label, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.actionId,
    input.userId,
    input.evidenceQuality,
    input.resultSummary ?? null,
    input.scoreValue ?? null,
    input.scoreLabel ?? null,
    input.notes ?? null
  );
  return rowToEvidence(db.prepare(`SELECT * FROM action_evidence WHERE id = ?`).get(id));
}

export function listEvidenceForAction(userId: string, actionId: string): ActionEvidenceRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM action_evidence WHERE user_id = ? AND action_id = ? ORDER BY created_at ASC`)
    .all(userId, actionId);
  return rows.map(rowToEvidence);
}

export function listEvidenceSince(userId: string, sinceIso: string): ActionEvidenceRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM action_evidence WHERE user_id = ? AND created_at >= ? ORDER BY created_at ASC`)
    .all(userId, sinceIso);
  return rows.map(rowToEvidence);
}

// ---------- outcomes ----------

function rowToOutcome(r: any): ActionOutcomeRecord {
  return {
    id: r.id,
    actionId: r.action_id,
    userId: r.user_id,
    impact: r.impact,
    nextRecommendation: r.next_recommendation,
    createdAt: r.created_at,
  };
}

export function createOutcome(
  userId: string,
  actionId: string,
  impact: ActionImpact,
  nextRecommendation?: string | null
): ActionOutcomeRecord {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO action_outcomes (id, action_id, user_id, impact, next_recommendation) VALUES (?, ?, ?, ?, ?)`
  ).run(id, actionId, userId, impact, nextRecommendation ?? null);
  return rowToOutcome(db.prepare(`SELECT * FROM action_outcomes WHERE id = ?`).get(id));
}

export function listOutcomesSince(userId: string, sinceIso: string): ActionOutcomeRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM action_outcomes WHERE user_id = ? AND created_at >= ? ORDER BY created_at ASC`)
    .all(userId, sinceIso);
  return rows.map(rowToOutcome);
}

// ---------- blockers ----------

function rowToBlocker(r: any): ExecutionBlockerRecord {
  return {
    id: r.id,
    actionId: r.action_id,
    userId: r.user_id,
    reasonCode: r.reason_code,
    reasonNote: r.reason_note,
    resolutionActionId: r.resolution_action_id,
    createdAt: r.created_at,
  };
}

export function createBlocker(input: {
  userId: string;
  actionId: string;
  reasonCode: BlockerReasonCode;
  reasonNote?: string | null;
}): ExecutionBlockerRecord {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO execution_blockers (id, action_id, user_id, reason_code, reason_note) VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.actionId, input.userId, input.reasonCode, input.reasonNote ?? null);
  return rowToBlocker(db.prepare(`SELECT * FROM execution_blockers WHERE id = ?`).get(id));
}

export function attachBlockerResolution(userId: string, blockerId: string, resolutionActionId: string): void {
  getDb()
    .prepare(`UPDATE execution_blockers SET resolution_action_id = ? WHERE id = ? AND user_id = ?`)
    .run(resolutionActionId, blockerId, userId);
}

export function listBlockersForAction(userId: string, actionId: string): ExecutionBlockerRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM execution_blockers WHERE user_id = ? AND action_id = ? ORDER BY created_at DESC`)
    .all(userId, actionId);
  return rows.map(rowToBlocker);
}

export function countBlockersByReasonSince(
  userId: string,
  sinceIso: string
): { reason_code: string; c: number }[] {
  return getDb()
    .prepare(
      `SELECT reason_code, COUNT(*) as c FROM execution_blockers WHERE user_id = ? AND created_at >= ?
       GROUP BY reason_code ORDER BY c DESC`
    )
    .all(userId, sinceIso) as { reason_code: string; c: number }[];
}
