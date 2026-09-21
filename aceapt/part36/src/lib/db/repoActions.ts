import { getDb, newId, nowIso } from "./index";
import type { ActionItem, ActionStatus, ActionType, DifficultyLevel, BlockerReasonCode, DeferReasonCode } from "../types";

function rowToAction(r: any): ActionItem {
  return {
    id: r.id,
    userId: r.user_id,
    goalId: r.goal_id,
    weeklyObjectiveId: r.weekly_objective_id,
    capabilityAreaId: r.capability_area_id,
    opportunityId: r.opportunity_id,
    parentActionId: r.parent_action_id,
    title: r.title,
    description: r.description,
    actionType: r.action_type,
    difficultyLevel: r.difficulty_level,
    estimatedMinutes: r.estimated_minutes,
    status: r.status,
    isPrimary: !!r.is_primary,
    priorityRank: r.priority_rank,
    rationaleText: r.rationale_text,
    rationaleBullets: safeParseArray(r.rationale_bullets),
    rationaleGeneratedBy: r.rationale_generated_by,
    deferCount: r.defer_count,
    lastDeferReason: r.last_defer_reason,
    blockedReason: r.blocked_reason,
    prerequisiteSatisfied: !!r.prerequisite_satisfied,
    recommendedAt: r.recommended_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function safeParseArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export interface CreateActionInput {
  userId: string;
  goalId: string;
  weeklyObjectiveId?: string | null;
  capabilityAreaId?: string | null;
  opportunityId?: string | null;
  parentActionId?: string | null;
  title: string;
  description?: string | null;
  actionType: ActionType;
  difficultyLevel?: DifficultyLevel;
  estimatedMinutes: number;
}

export function createAction(input: CreateActionInput): ActionItem {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO action_items
      (id, user_id, goal_id, weekly_objective_id, capability_area_id, opportunity_id, parent_action_id,
       title, description, action_type, difficulty_level, estimated_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.goalId,
    input.weeklyObjectiveId ?? null,
    input.capabilityAreaId ?? null,
    input.opportunityId ?? null,
    input.parentActionId ?? null,
    input.title,
    input.description ?? null,
    input.actionType,
    input.difficultyLevel ?? "BASIC",
    input.estimatedMinutes
  );
  return getActionById(input.userId, id)!;
}

export function getActionById(userId: string, id: string): ActionItem | undefined {
  const row = getDb().prepare(`SELECT * FROM action_items WHERE id = ? AND user_id = ?`).get(id, userId);
  return row ? rowToAction(row) : undefined;
}

/** Actions still open for consideration by the priority engine / scheduler. */
export function listCandidateActions(userId: string, goalId: string): ActionItem[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM action_items
       WHERE user_id = ? AND goal_id = ?
         AND status IN ('NOT_STARTED', 'DEFERRED')
       ORDER BY created_at ASC`
    )
    .all(userId, goalId);
  return rows.map(rowToAction);
}

export function listActionsByStatus(userId: string, statuses: ActionStatus[]): ActionItem[] {
  if (statuses.length === 0) return [];
  const placeholders = statuses.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT * FROM action_items WHERE user_id = ? AND status IN (${placeholders}) ORDER BY updated_at DESC`)
    .all(userId, ...statuses);
  return rows.map(rowToAction);
}

export function listActionsSince(userId: string, sinceIso: string): ActionItem[] {
  const rows = getDb()
    .prepare(`SELECT * FROM action_items WHERE user_id = ? AND created_at >= ? ORDER BY created_at ASC`)
    .all(userId, sinceIso);
  return rows.map(rowToAction);
}

export function listActionsUpdatedSince(userId: string, sinceIso: string): ActionItem[] {
  const rows = getDb()
    .prepare(`SELECT * FROM action_items WHERE user_id = ? AND updated_at >= ? ORDER BY updated_at ASC`)
    .all(userId, sinceIso);
  return rows.map(rowToAction);
}

export function listChildActions(userId: string, parentActionId: string): ActionItem[] {
  const rows = getDb()
    .prepare(`SELECT * FROM action_items WHERE user_id = ? AND parent_action_id = ? ORDER BY created_at ASC`)
    .all(userId, parentActionId);
  return rows.map(rowToAction);
}

export function listCompletedForCapability(userId: string, capabilityAreaId: string): ActionItem[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM action_items
       WHERE user_id = ? AND capability_area_id = ?
         AND status IN ('SELF_REPORTED_COMPLETE','VERIFIED_COMPLETE','MEASURED','IMPROVED')
       ORDER BY completed_at DESC`
    )
    .all(userId, capabilityAreaId);
  return rows.map(rowToAction);
}

/** The currently standing primary action, if it is still open (not
 *  yet completed/deferred/blocked). Used so "today" only re-ranks
 *  when there truly is no current answer, instead of on every load. */
export function getCurrentPrimary(userId: string, goalId: string): ActionItem | undefined {
  const row = getDb()
    .prepare(
      `SELECT * FROM action_items
       WHERE user_id = ? AND goal_id = ? AND is_primary = 1 AND status IN ('NOT_STARTED', 'STARTED')
       ORDER BY recommended_at DESC LIMIT 1`
    )
    .get(userId, goalId);
  return row ? rowToAction(row) : undefined;
}

export function listSupporting(userId: string, goalId: string): ActionItem[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM action_items
       WHERE user_id = ? AND goal_id = ? AND is_primary = 0 AND status IN ('NOT_STARTED', 'STARTED')
         AND priority_rank IS NOT NULL AND priority_rank <= 2
       ORDER BY priority_rank ASC LIMIT 2`
    )
    .all(userId, goalId);
  return rows.map(rowToAction);
}

export function clearPrimary(userId: string, goalId: string): void {
  getDb()
    .prepare(`UPDATE action_items SET is_primary = 0 WHERE user_id = ? AND goal_id = ? AND is_primary = 1`)
    .run(userId, goalId);
}

export function setRecommendation(
  userId: string,
  id: string,
  fields: {
    isPrimary: boolean;
    priorityRank: number;
    rationaleText: string;
    rationaleBullets: string[];
    rationaleGeneratedBy: "AI" | "DETERMINISTIC";
  }
): void {
  getDb()
    .prepare(
      `UPDATE action_items SET
        is_primary = ?, priority_rank = ?, rationale_text = ?, rationale_bullets = ?,
        rationale_generated_by = ?, recommended_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(
      fields.isPrimary ? 1 : 0,
      fields.priorityRank,
      fields.rationaleText,
      JSON.stringify(fields.rationaleBullets),
      fields.rationaleGeneratedBy,
      nowIso(),
      nowIso(),
      id,
      userId
    );
}

export function setPriorityRankOnly(userId: string, id: string, rank: number): void {
  getDb()
    .prepare(`UPDATE action_items SET priority_rank = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(rank, nowIso(), id, userId);
}

export function updateStatus(userId: string, id: string, status: ActionStatus): void {
  getDb()
    .prepare(`UPDATE action_items SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(status, nowIso(), id, userId);
}

export function markStarted(userId: string, id: string): void {
  getDb()
    .prepare(
      `UPDATE action_items SET status = 'STARTED', started_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(nowIso(), nowIso(), id, userId);
}

export function markCompleted(userId: string, id: string, status: ActionStatus): void {
  getDb()
    .prepare(
      `UPDATE action_items SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(status, nowIso(), nowIso(), id, userId);
}

export function markDeferred(userId: string, id: string, reason: DeferReasonCode): void {
  getDb()
    .prepare(
      `UPDATE action_items SET status = 'DEFERRED', defer_count = defer_count + 1, last_defer_reason = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(reason, nowIso(), id, userId);
}

export function markBlocked(userId: string, id: string, reason: BlockerReasonCode): void {
  getDb()
    .prepare(
      `UPDATE action_items SET status = 'BLOCKED', blocked_reason = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(reason, nowIso(), id, userId);
}

export function markCancelled(userId: string, id: string): void {
  getDb()
    .prepare(`UPDATE action_items SET status = 'CANCELLED', updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(nowIso(), id, userId);
}

export function setDifficulty(userId: string, id: string, level: string): void {
  getDb()
    .prepare(`UPDATE action_items SET difficulty_level = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(level, nowIso(), id, userId);
}

export function countActionsRecommendedSince(userId: string, sinceIso: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) as c FROM action_items WHERE user_id = ? AND recommended_at >= ?`)
    .get(userId, sinceIso) as { c: number };
  return row.c;
}

export function countActionsByStatusSince(
  userId: string,
  status: ActionStatus,
  sinceIso: string
): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM action_items WHERE user_id = ? AND status = ? AND updated_at >= ?`
    )
    .get(userId, status, sinceIso) as { c: number };
  return row.c;
}
