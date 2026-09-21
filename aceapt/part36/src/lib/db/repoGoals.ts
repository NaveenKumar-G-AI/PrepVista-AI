import { getDb, newId, nowIso } from "./index";
import type { CareerGoal, CapabilityArea, Milestone, WeeklyObjective, CapabilityTrend } from "../types";

// ---------- mappers ----------

function rowToGoal(r: any): CareerGoal {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    targetRole: r.target_role,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToCapability(r: any): CapabilityArea {
  return {
    id: r.id,
    userId: r.user_id,
    goalId: r.goal_id,
    name: r.name,
    isCurrentBottleneck: !!r.is_current_bottleneck,
    trend: r.trend,
    evidenceCount: r.evidence_count,
    lastEvidenceAt: r.last_evidence_at,
  };
}

function rowToMilestone(r: any): Milestone {
  return { id: r.id, goalId: r.goal_id, title: r.title, sequence: r.sequence, status: r.status };
}

function rowToObjective(r: any): WeeklyObjective {
  return {
    id: r.id,
    milestoneId: r.milestone_id,
    title: r.title,
    weekStart: r.week_start,
    status: r.status,
  };
}

// ---------- goals ----------

export function createGoal(userId: string, title: string, targetRole: string): CareerGoal {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO career_goals (id, user_id, title, target_role) VALUES (?, ?, ?, ?)`
  ).run(id, userId, title, targetRole);
  return getGoalById(userId, id)!;
}

export function getActiveGoal(userId: string): CareerGoal | undefined {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM career_goals WHERE user_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`)
    .get(userId);
  return row ? rowToGoal(row) : undefined;
}

export function getGoalById(userId: string, goalId: string): CareerGoal | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM career_goals WHERE id = ? AND user_id = ?`).get(goalId, userId);
  return row ? rowToGoal(row) : undefined;
}

export function touchGoal(userId: string, goalId: string): void {
  getDb()
    .prepare(`UPDATE career_goals SET updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(nowIso(), goalId, userId);
}

// ---------- capability areas ----------

export function createCapabilityArea(userId: string, goalId: string, name: string): CapabilityArea {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO capability_areas (id, user_id, goal_id, name) VALUES (?, ?, ?, ?)`
  ).run(id, userId, goalId, name);
  return getCapabilityById(userId, id)!;
}

export function getCapabilityById(userId: string, id: string): CapabilityArea | undefined {
  const row = getDb().prepare(`SELECT * FROM capability_areas WHERE id = ? AND user_id = ?`).get(id, userId);
  return row ? rowToCapability(row) : undefined;
}

export function listCapabilities(userId: string, goalId: string): CapabilityArea[] {
  const rows = getDb()
    .prepare(`SELECT * FROM capability_areas WHERE user_id = ? AND goal_id = ? ORDER BY created_at ASC`)
    .all(userId, goalId);
  return rows.map(rowToCapability);
}

export function getCurrentBottleneck(userId: string, goalId: string): CapabilityArea | undefined {
  const row = getDb()
    .prepare(
      `SELECT * FROM capability_areas WHERE user_id = ? AND goal_id = ? AND is_current_bottleneck = 1 ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId, goalId);
  return row ? rowToCapability(row) : undefined;
}

export function setBottleneck(userId: string, goalId: string, capabilityId: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE capability_areas SET is_current_bottleneck = 0 WHERE user_id = ? AND goal_id = ?`).run(
      userId,
      goalId
    );
    db.prepare(`UPDATE capability_areas SET is_current_bottleneck = 1 WHERE user_id = ? AND id = ?`).run(
      userId,
      capabilityId
    );
  });
  tx();
}

export function updateCapabilityTrend(userId: string, id: string, trend: CapabilityTrend): void {
  getDb()
    .prepare(`UPDATE capability_areas SET trend = ? WHERE id = ? AND user_id = ?`)
    .run(trend, id, userId);
}

export function recordCapabilityEvidence(userId: string, id: string): void {
  getDb()
    .prepare(
      `UPDATE capability_areas SET evidence_count = evidence_count + 1, last_evidence_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(nowIso(), id, userId);
}

// ---------- milestones ----------

export function createMilestone(goalId: string, title: string, sequence: number): Milestone {
  const db = getDb();
  const id = newId();
  db.prepare(`INSERT INTO milestones (id, goal_id, title, sequence) VALUES (?, ?, ?, ?)`).run(
    id,
    goalId,
    title,
    sequence
  );
  return rowToMilestone(db.prepare(`SELECT * FROM milestones WHERE id = ?`).get(id));
}

export function listMilestones(goalId: string): Milestone[] {
  const rows = getDb()
    .prepare(`SELECT * FROM milestones WHERE goal_id = ? ORDER BY sequence ASC`)
    .all(goalId);
  return rows.map(rowToMilestone);
}

export function getActiveMilestone(goalId: string): Milestone | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM milestones WHERE goal_id = ? AND status = 'ACTIVE' ORDER BY sequence ASC LIMIT 1`)
    .get(goalId);
  return row ? rowToMilestone(row) : undefined;
}

// ---------- weekly objectives ----------

export function createWeeklyObjective(milestoneId: string, title: string, weekStart: string): WeeklyObjective {
  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO weekly_objectives (id, milestone_id, title, week_start) VALUES (?, ?, ?, ?)`
  ).run(id, milestoneId, title, weekStart);
  return rowToObjective(db.prepare(`SELECT * FROM weekly_objectives WHERE id = ?`).get(id));
}

export function getCurrentWeeklyObjective(milestoneId: string, weekStart: string): WeeklyObjective | undefined {
  const row = getDb()
    .prepare(
      `SELECT * FROM weekly_objectives WHERE milestone_id = ? AND week_start = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(milestoneId, weekStart);
  return row ? rowToObjective(row) : undefined;
}

export function getObjectiveById(id: string): WeeklyObjective | undefined {
  const row = getDb().prepare(`SELECT * FROM weekly_objectives WHERE id = ?`).get(id);
  return row ? rowToObjective(row) : undefined;
}
