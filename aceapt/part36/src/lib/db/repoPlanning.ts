import { getDb, newId, nowIso } from "./index";
import type { Opportunity, Commitment, OpportunityType, ConfidenceLevel } from "../types";

// ---------- time availability ----------

export function upsertTimeAvailability(userId: string, weekStart: string, availableMinutes: number): void {
  getDb()
    .prepare(
      `INSERT INTO time_availability (id, user_id, week_start, available_minutes)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, week_start) DO UPDATE SET available_minutes = excluded.available_minutes`
    )
    .run(newId(), userId, weekStart, availableMinutes);
}

export function getTimeAvailability(userId: string, weekStart: string): number | undefined {
  const row = getDb()
    .prepare(`SELECT available_minutes FROM time_availability WHERE user_id = ? AND week_start = ?`)
    .get(userId, weekStart) as { available_minutes: number } | undefined;
  return row?.available_minutes;
}

// ---------- opportunities ----------

function rowToOpportunity(r: any): Opportunity {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    organization: r.organization,
    eventDate: r.event_date,
    opportunityType: r.opportunity_type,
    status: r.status,
    requiredCapabilities: safeParse(r.required_capabilities, []),
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

export function createOpportunity(input: {
  userId: string;
  title: string;
  organization?: string | null;
  eventDate?: string | null;
  opportunityType: OpportunityType;
  requiredCapabilities?: string[];
}): Opportunity {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO opportunities (id, user_id, title, organization, event_date, opportunity_type, required_capabilities)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.title,
    input.organization ?? null,
    input.eventDate ?? null,
    input.opportunityType,
    JSON.stringify(input.requiredCapabilities ?? [])
  );
  return rowToOpportunity(db.prepare(`SELECT * FROM opportunities WHERE id = ?`).get(id));
}

export function listUpcomingOpportunities(userId: string): Opportunity[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM opportunities WHERE user_id = ? AND status = 'UPCOMING' ORDER BY event_date ASC`
    )
    .all(userId);
  return rows.map(rowToOpportunity);
}

export function getOpportunityById(userId: string, id: string): Opportunity | undefined {
  const row = getDb().prepare(`SELECT * FROM opportunities WHERE id = ? AND user_id = ?`).get(id, userId);
  return row ? rowToOpportunity(row) : undefined;
}

// ---------- commitments (exams etc., for deadline collision detection) ----------

function rowToCommitment(r: any): Commitment {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    commitmentType: r.commitment_type,
    eventDate: r.event_date,
    loadLevel: r.load_level,
  };
}

export function createCommitment(input: {
  userId: string;
  title: string;
  commitmentType: "ACADEMIC" | "PERSONAL";
  eventDate: string;
  loadLevel?: "LOW" | "MEDIUM" | "HIGH";
}): Commitment {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO commitments (id, user_id, title, commitment_type, event_date, load_level) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, input.userId, input.title, input.commitmentType, input.eventDate, input.loadLevel ?? "HIGH");
  return rowToCommitment(db.prepare(`SELECT * FROM commitments WHERE id = ?`).get(id));
}

export function listUpcomingCommitments(userId: string): Commitment[] {
  const rows = getDb()
    .prepare(`SELECT * FROM commitments WHERE user_id = ? AND event_date >= date('now') ORDER BY event_date ASC`)
    .all(userId);
  return rows.map(rowToCommitment);
}

// ---------- plan adjustments (spec section 25/29 — the "what changed and why" log) ----------

export function createPlanAdjustment(userId: string, goalId: string | null, reason: string, description: string): void {
  getDb()
    .prepare(
      `INSERT INTO plan_adjustments (id, user_id, goal_id, reason, description) VALUES (?, ?, ?, ?, ?)`
    )
    .run(newId(), userId, goalId, reason, description);
}

export function listRecentAdjustments(userId: string, sinceIso: string) {
  return getDb()
    .prepare(`SELECT * FROM plan_adjustments WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC`)
    .all(userId, sinceIso) as {
    id: string;
    reason: string;
    description: string;
    created_at: string;
  }[];
}

// ---------- execution events (career execution memory, section 42/58) ----------

export function logEvent(userId: string, eventType: string, payload: Record<string, unknown> = {}): void {
  getDb()
    .prepare(`INSERT INTO execution_events (id, user_id, event_type, payload) VALUES (?, ?, ?, ?)`)
    .run(newId(), userId, eventType, JSON.stringify(payload));
}

export function listRecentEvents(userId: string, limit = 100) {
  return getDb()
    .prepare(`SELECT * FROM execution_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as { id: string; event_type: string; payload: string; created_at: string }[];
}

// ---------- weekly review cache ----------

export function getCachedWeeklyReview(userId: string, weekStart: string) {
  return getDb()
    .prepare(`SELECT * FROM weekly_review_cache WHERE user_id = ? AND week_start = ?`)
    .get(userId, weekStart) as { narrative_text: string; generated_by: string } | undefined;
}

export function setCachedWeeklyReview(
  userId: string,
  weekStart: string,
  narrativeText: string,
  generatedBy: "AI" | "DETERMINISTIC"
): void {
  getDb()
    .prepare(
      `INSERT INTO weekly_review_cache (user_id, week_start, narrative_text, generated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, week_start) DO UPDATE SET narrative_text = excluded.narrative_text, generated_by = excluded.generated_by`
    )
    .run(userId, weekStart, narrativeText, generatedBy);
}

// ---------- personal execution model (section 41) ----------

export function getPreferences(userId: string) {
  return getDb().prepare(`SELECT * FROM execution_preferences WHERE user_id = ?`).get(userId) as
    | { preferred_session_minutes: number | null; confidence: ConfidenceLevel; sample_count: number }
    | undefined;
}

export function upsertPreferences(userId: string, preferredMinutes: number, confidence: ConfidenceLevel, sampleCount: number): void {
  getDb()
    .prepare(
      `INSERT INTO execution_preferences (user_id, preferred_session_minutes, confidence, sample_count, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET preferred_session_minutes = excluded.preferred_session_minutes,
         confidence = excluded.confidence, sample_count = excluded.sample_count, updated_at = excluded.updated_at`
    )
    .run(userId, preferredMinutes, confidence, sampleCount, nowIso());
}
