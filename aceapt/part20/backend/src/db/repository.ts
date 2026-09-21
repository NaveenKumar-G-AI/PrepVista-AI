import type { PoolClient } from "pg";
import { pool, withClient, withTransaction } from "./pool.js";
import type { EngineQuestion, EngineResponse, EngineEvent, Marking } from "../engine/types.js";
import type { Difficulty } from "../domain/questionBank.js";

export interface BlueprintRow {
  id: string;
  slug: string;
  name: string;
  kind: "main" | "drill";
  question_count: number;
  duration_sec: number;
  marking_correct: string;
  marking_wrong: string;
  marking_skip: string;
}

export interface QuestionRow {
  id: string;
  slug: string;
  concept: string;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface SessionRow {
  id: string;
  student_id: string;
  blueprint_id: string;
  parent_session_id: string | null;
  status: string;
  started_at: string;
  submitted_at: string | null;
  used_sec: number | null;
}

export function markingFromBlueprint(bp: BlueprintRow): Marking {
  return { correct: Number(bp.marking_correct), wrong: Number(bp.marking_wrong), skip: Number(bp.marking_skip) };
}

export async function getOrCreateDemoStudent(): Promise<string> {
  const existing = await pool.query<{ id: string }>("SELECT id FROM students ORDER BY created_at LIMIT 1");
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query<{ id: string }>(
    "INSERT INTO students (display_name) VALUES ('Demo Student') RETURNING id"
  );
  return created.rows[0].id;
}

export async function getBlueprintBySlug(slug: string): Promise<BlueprintRow | null> {
  const res = await pool.query<BlueprintRow>("SELECT * FROM blueprints WHERE slug = $1", [slug]);
  return res.rows[0] ?? null;
}

export async function getBlueprintById(id: string): Promise<BlueprintRow | null> {
  const res = await pool.query<BlueprintRow>("SELECT * FROM blueprints WHERE id = $1", [id]);
  return res.rows[0] ?? null;
}

export async function getBlueprintQuestions(blueprintId: string): Promise<(QuestionRow & { sequence_index: number })[]> {
  const res = await pool.query(
    `SELECT q.*, bq.sequence_index
     FROM blueprint_questions bq
     JOIN questions q ON q.id = bq.question_id
     WHERE bq.blueprint_id = $1
     ORDER BY bq.sequence_index ASC`,
    [blueprintId]
  );
  return res.rows;
}

export async function getQuestionsBySlugs(slugs: string[]): Promise<QuestionRow[]> {
  const res = await pool.query<QuestionRow>("SELECT * FROM questions WHERE slug = ANY($1::text[])", [slugs]);
  return res.rows;
}

export async function getQuestionsByConceptExcluding(concept: string, excludeSlugs: string[], limit: number) {
  const res = await pool.query<QuestionRow>(
    `SELECT * FROM questions WHERE concept != $1 AND slug != ALL($2::text[]) AND 'selection-drill' != ALL(tags)
     ORDER BY random() LIMIT $3`,
    [concept, excludeSlugs, limit]
  );
  return res.rows;
}

export async function getQuestionsForConcept(concept: string, limit: number) {
  const res = await pool.query<QuestionRow>(
    `SELECT * FROM questions WHERE concept = $1 ORDER BY random() LIMIT $2`,
    [concept, limit]
  );
  return res.rows;
}

export async function createBlueprint(
  client: PoolClient,
  params: { slug: string; name: string; kind: "main" | "drill"; questionCount: number; durationSec: number; marking: Marking }
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO blueprints (slug, name, kind, question_count, duration_sec, marking_correct, marking_wrong, marking_skip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      params.slug,
      params.name,
      params.kind,
      params.questionCount,
      params.durationSec,
      params.marking.correct,
      params.marking.wrong,
      params.marking.skip,
    ]
  );
  return res.rows[0].id;
}

export async function createSessionWithBlueprint(
  studentId: string,
  blueprintId: string,
  questionIds: string[],
  parentSessionId: string | null
): Promise<string> {
  return withTransaction(async (client) => {
    const sessionRes = await client.query<{ id: string }>(
      `INSERT INTO sessions (student_id, blueprint_id, parent_session_id, status)
       VALUES ($1,$2,$3,'IN_PROGRESS') RETURNING id`,
      [studentId, blueprintId, parentSessionId]
    );
    const sessionId = sessionRes.rows[0].id;

    for (let i = 0; i < questionIds.length; i++) {
      await client.query(
        `INSERT INTO session_responses (session_id, question_id, sequence_index) VALUES ($1,$2,$3)`,
        [sessionId, questionIds[i], i]
      );
    }
    await client.query(
      `INSERT INTO session_events (session_id, type) VALUES ($1, 'SIMULATION_STARTED')`,
      [sessionId]
    );
    return sessionId;
  });
}

export async function getSession(sessionId: string): Promise<SessionRow | null> {
  const res = await pool.query<SessionRow>("SELECT * FROM sessions WHERE id = $1", [sessionId]);
  return res.rows[0] ?? null;
}

export async function getSessionQuestionsOrdered(sessionId: string): Promise<(QuestionRow & { sequence_index: number })[]> {
  const res = await pool.query(
    `SELECT q.*, sr.sequence_index
     FROM session_responses sr
     JOIN questions q ON q.id = sr.question_id
     WHERE sr.session_id = $1
     ORDER BY sr.sequence_index ASC`,
    [sessionId]
  );
  return res.rows;
}

export async function getSessionResponses(sessionId: string) {
  const res = await pool.query(
    `SELECT question_id, sequence_index, status, selected_index, marked_for_review, time_spent_ms, first_viewed_at, visits
     FROM session_responses WHERE session_id = $1`,
    [sessionId]
  );
  return res.rows as {
    question_id: string;
    sequence_index: number;
    status: "unvisited" | "viewed" | "answered";
    selected_index: number | null;
    marked_for_review: boolean;
    time_spent_ms: string;
    first_viewed_at: string | null;
    visits: number;
  }[];
}

export async function getSessionEvents(sessionId: string): Promise<EngineEvent[]> {
  const res = await pool.query(
    `SELECT type, question_id, from_index, to_index, occurred_at FROM session_events
     WHERE session_id = $1 ORDER BY occurred_at ASC, id ASC`,
    [sessionId]
  );
  return res.rows.map((r) => ({
    type: r.type,
    questionId: r.question_id,
    fromIndex: r.from_index,
    toIndex: r.to_index,
    occurredAt: r.occurred_at,
  }));
}

export async function recordEvent(
  sessionId: string,
  type: string,
  opts: { questionId?: string | null; fromIndex?: number | null; toIndex?: number | null } = {}
) {
  await pool.query(
    `INSERT INTO session_events (session_id, type, question_id, from_index, to_index) VALUES ($1,$2,$3,$4,$5)`,
    [sessionId, type, opts.questionId ?? null, opts.fromIndex ?? null, opts.toIndex ?? null]
  );
}

export async function navigateTo(
  sessionId: string,
  params: { fromQuestionId: string | null; fromIndex: number | null; toQuestionId: string; toIndex: number; elapsedMs: number }
) {
  await withTransaction(async (client) => {
    if (params.fromQuestionId && params.elapsedMs > 0) {
      await client.query(
        `UPDATE session_responses SET time_spent_ms = time_spent_ms + $1
         WHERE session_id = $2 AND question_id = $3`,
        [Math.round(params.elapsedMs), sessionId, params.fromQuestionId]
      );
    }
    await client.query(
      `UPDATE session_responses
       SET status = CASE WHEN status = 'unvisited' THEN 'viewed' ELSE status END,
           first_viewed_at = COALESCE(first_viewed_at, now()),
           visits = visits + 1
       WHERE session_id = $1 AND question_id = $2`,
      [sessionId, params.toQuestionId]
    );
    await client.query(
      `INSERT INTO session_events (session_id, type, question_id, from_index, to_index)
       VALUES ($1, 'NAVIGATED', $2, $3, $4)`,
      [sessionId, params.toQuestionId, params.fromIndex, params.toIndex]
    );
  });
}

export async function recordAnswer(sessionId: string, questionId: string, selectedIndex: number) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE session_responses SET status = 'answered', selected_index = $1
       WHERE session_id = $2 AND question_id = $3`,
      [selectedIndex, sessionId, questionId]
    );
    await client.query(
      `INSERT INTO session_events (session_id, type, question_id) VALUES ($1, 'QUESTION_ATTEMPTED', $2)`,
      [sessionId, questionId]
    );
  });
}

export async function clearAnswer(sessionId: string, questionId: string) {
  await pool.query(
    `UPDATE session_responses SET status = 'viewed', selected_index = NULL
     WHERE session_id = $1 AND question_id = $2`,
    [sessionId, questionId]
  );
}

export async function setMarkedForReview(sessionId: string, questionId: string, marked: boolean) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE session_responses SET marked_for_review = $1 WHERE session_id = $2 AND question_id = $3`,
      [marked, sessionId, questionId]
    );
    await client.query(
      `INSERT INTO session_events (session_id, type, question_id) VALUES ($1, 'QUESTION_MARKED_REVIEW', $2)`,
      [sessionId, questionId]
    );
  });
}

export async function flushFinalTime(sessionId: string, questionId: string | null, elapsedMs: number) {
  if (!questionId || elapsedMs <= 0) return;
  await pool.query(
    `UPDATE session_responses SET time_spent_ms = time_spent_ms + $1 WHERE session_id = $2 AND question_id = $3`,
    [Math.round(elapsedMs), sessionId, questionId]
  );
}

export async function setSessionStatus(sessionId: string, status: string, extra: { usedSec?: number } = {}) {
  if (extra.usedSec !== undefined) {
    await pool.query(`UPDATE sessions SET status = $1, submitted_at = now(), used_sec = $2 WHERE id = $3`, [
      status,
      extra.usedSec,
      sessionId,
    ]);
  } else {
    await pool.query(`UPDATE sessions SET status = $1 WHERE id = $2`, [status, sessionId]);
  }
}

export async function storeEvidence(sessionId: string, evidence: unknown, narrative: string | null, narrativeSource: string | null) {
  await pool.query(
    `INSERT INTO session_evidence (session_id, evidence, narrative, narrative_source)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (session_id) DO UPDATE SET evidence = EXCLUDED.evidence, narrative = EXCLUDED.narrative,
       narrative_source = EXCLUDED.narrative_source, computed_at = now()`,
    [sessionId, JSON.stringify(evidence), narrative, narrativeSource]
  );
}

export async function getEvidence(sessionId: string) {
  const res = await pool.query(
    `SELECT evidence, narrative, narrative_source FROM session_evidence WHERE session_id = $1`,
    [sessionId]
  );
  return res.rows[0] ?? null;
}

export async function updateNarrative(sessionId: string, narrative: string, source: string) {
  await pool.query(`UPDATE session_evidence SET narrative = $1, narrative_source = $2 WHERE session_id = $3`, [
    narrative,
    source,
    sessionId,
  ]);
}

export async function appendMockHistory(params: {
  studentId: string;
  sessionId: string;
  score: number;
  maxScore: number;
  accuracyPct: number;
  selectionQuality: string;
}) {
  await pool.query(
    `INSERT INTO mock_history (student_id, session_id, score, max_score, accuracy, selection_quality)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [params.studentId, params.sessionId, params.score, params.maxScore, params.accuracyPct, params.selectionQuality]
  );
}

export async function getMockHistory(studentId: string, limit = 10) {
  const res = await pool.query(
    `SELECT session_id, score, max_score, accuracy, selection_quality, completed_at
     FROM mock_history WHERE student_id = $1 ORDER BY completed_at DESC LIMIT $2`,
    [studentId, limit]
  );
  return res.rows;
}

/** Converts raw DB rows into the plain-object shapes the deterministic engine expects. */
export function toEngineQuestions(rows: (QuestionRow & { sequence_index: number })[]): EngineQuestion[] {
  return rows.map((r) => ({
    id: r.id,
    sequenceIndex: r.sequence_index,
    concept: r.concept,
    difficulty: r.difficulty,
    correctIndex: r.correct_index,
  }));
}

export function toEngineResponses(rows: Awaited<ReturnType<typeof getSessionResponses>>): Map<string, EngineResponse> {
  const map = new Map<string, EngineResponse>();
  for (const r of rows) {
    map.set(r.question_id, {
      questionId: r.question_id,
      status: r.status,
      selectedIndex: r.selected_index,
      markedForReview: r.marked_for_review,
      timeSpentMs: Number(r.time_spent_ms),
      visits: r.visits,
    });
  }
  return map;
}

export { withClient, withTransaction };
