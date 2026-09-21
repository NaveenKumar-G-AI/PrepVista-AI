import type pg from "pg";
import type { Goal } from "../domain/types.js";

function rowToGoal(row: any): Goal {
  return {
    id: row.id,
    studentId: row.student_id,
    goalType: row.goal_type,
    title: row.title,
    description: row.description,
    status: row.status,
    isPrimary: row.is_primary,
    priorityOrder: row.priority_order,
    deadlineType: row.deadline_type,
    targetDate: row.target_date ? toDateString(row.target_date) : null,
    availableTime: row.available_time ?? {},
    targetCapability: row.target_capability ?? {},
    targetAccuracy: row.target_accuracy !== null ? Number(row.target_accuracy) : null,
    targetSpeedBand: row.target_speed_band,
    studentReportedWeakness: row.student_reported_weakness,
    currentStateSnapshot: row.current_state_snapshot ?? {},
    targetStateSnapshot: row.target_state_snapshot ?? {},
    gapSnapshot: row.gap_snapshot ?? {},
    prioritySnapshot: row.priority_snapshot ?? [],
    health: row.health,
    healthReason: row.health_reason,
    feasibility: row.feasibility,
    confidence: row.confidence,
    progress: Number(row.progress),
    studentMarkedComplete: row.student_marked_complete,
    systemVerifiedComplete: row.system_verified_complete,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    pausedAt: row.paused_at ? row.paused_at.toISOString() : null,
    resumedAt: row.resumed_at ? row.resumed_at.toISOString() : null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toDateString(d: Date | string): string {
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}

export interface CreateGoalInput {
  studentId: string;
  goalType: Goal["goalType"];
  title: string;
  description: string | null;
  deadlineType: Goal["deadlineType"];
  targetDate: string | null;
  availableTime: Goal["availableTime"];
  targetCapability: Goal["targetCapability"];
  targetAccuracy: number | null;
  targetSpeedBand: Goal["targetSpeedBand"];
  studentReportedWeakness: string | null;
  isPrimary: boolean;
  priorityOrder: number;
  metadata: Record<string, unknown>;
}

export const goalRepository = {
  async create(client: pg.PoolClient, input: CreateGoalInput): Promise<Goal> {
    const res = await client.query(
      `INSERT INTO goals (
        student_id, goal_type, title, description, deadline_type, target_date,
        available_time, target_capability, target_accuracy, target_speed_band,
        student_reported_weakness, is_primary, priority_order, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *`,
      [
        input.studentId,
        input.goalType,
        input.title,
        input.description,
        input.deadlineType,
        input.targetDate,
        JSON.stringify(input.availableTime),
        JSON.stringify(input.targetCapability),
        input.targetAccuracy,
        input.targetSpeedBand,
        input.studentReportedWeakness,
        input.isPrimary,
        input.priorityOrder,
        JSON.stringify(input.metadata),
      ]
    );
    return rowToGoal(res.rows[0]);
  },

  async findById(client: pg.PoolClient, id: string): Promise<Goal | null> {
    const res = await client.query("SELECT * FROM goals WHERE id = $1", [id]);
    return res.rows[0] ? rowToGoal(res.rows[0]) : null;
  },

  async listForStudent(client: pg.PoolClient, statuses?: Goal["status"][]): Promise<Goal[]> {
    const res = statuses?.length
      ? await client.query("SELECT * FROM goals WHERE status = ANY($1) ORDER BY is_primary DESC, priority_order ASC, created_at DESC", [statuses])
      : await client.query("SELECT * FROM goals ORDER BY is_primary DESC, priority_order ASC, created_at DESC");
    return res.rows.map(rowToGoal);
  },

  async updateComputedState(
    client: pg.PoolClient,
    id: string,
    fields: {
      currentStateSnapshot: unknown;
      targetStateSnapshot: unknown;
      gapSnapshot: unknown;
      prioritySnapshot: unknown;
      health: Goal["health"];
      healthReason: string | null;
      feasibility: Goal["feasibility"];
      confidence: Goal["confidence"];
      progress: number;
    }
  ): Promise<Goal> {
    const res = await client.query(
      `UPDATE goals SET
        current_state_snapshot = $2, target_state_snapshot = $3, gap_snapshot = $4,
        priority_snapshot = $5, health = $6, health_reason = $7, feasibility = $8,
        confidence = $9, progress = $10
       WHERE id = $1 RETURNING *`,
      [
        id,
        JSON.stringify(fields.currentStateSnapshot),
        JSON.stringify(fields.targetStateSnapshot),
        JSON.stringify(fields.gapSnapshot),
        JSON.stringify(fields.prioritySnapshot),
        fields.health,
        fields.healthReason,
        fields.feasibility,
        fields.confidence,
        fields.progress,
      ]
    );
    return rowToGoal(res.rows[0]);
  },

  async updateStatus(
    client: pg.PoolClient,
    id: string,
    status: Goal["status"],
    extra: Partial<{
      pausedAt: Date;
      resumedAt: Date;
      completedAt: Date;
      studentMarkedComplete: boolean;
      systemVerifiedComplete: boolean;
      health: Goal["health"];
      healthReason: string;
    }> = {}
  ): Promise<Goal> {
    const res = await client.query(
      `UPDATE goals SET
        status = $2,
        paused_at = COALESCE($3, paused_at),
        resumed_at = COALESCE($4, resumed_at),
        completed_at = COALESCE($5, completed_at),
        student_marked_complete = COALESCE($6, student_marked_complete),
        system_verified_complete = COALESCE($7, system_verified_complete),
        health = COALESCE($8, health),
        health_reason = COALESCE($9, health_reason)
       WHERE id = $1 RETURNING *`,
      [
        id,
        status,
        extra.pausedAt ?? null,
        extra.resumedAt ?? null,
        extra.completedAt ?? null,
        extra.studentMarkedComplete ?? null,
        extra.systemVerifiedComplete ?? null,
        extra.health ?? null,
        extra.healthReason ?? null,
      ]
    );
    return rowToGoal(res.rows[0]);
  },
};
