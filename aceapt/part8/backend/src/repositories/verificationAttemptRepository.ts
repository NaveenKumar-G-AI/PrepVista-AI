import type { PoolClient } from "pg";
import type { VerificationAttempt, VerificationObjective, AttemptStatus, AttemptResult, VerificationQuestionPlanItem } from "../types/index.js";

function mapRow(r: any): VerificationAttempt {
  return {
    id: r.id,
    studentId: r.student_id,
    skillId: r.skill_id,
    objective: r.objective,
    status: r.status,
    result: r.result,
    questionPlan: r.question_plan,
    currentIndex: r.current_index,
    evidenceSummary: r.evidence_summary,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

export async function createVerificationAttempt(
  client: PoolClient,
  input: { id: string; studentId: string; skillId: string; objective: VerificationObjective; questionPlan: VerificationQuestionPlanItem[] }
): Promise<VerificationAttempt> {
  const { rows } = await client.query(
    `INSERT INTO verification_attempts (id, student_id, skill_id, objective, question_plan)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [input.id, input.studentId, input.skillId, input.objective, JSON.stringify(input.questionPlan)]
  );
  return mapRow(rows[0]);
}

export async function getVerificationAttempt(client: PoolClient, id: string): Promise<VerificationAttempt | null> {
  const { rows } = await client.query(`SELECT * FROM verification_attempts WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateAttemptProgress(
  client: PoolClient,
  id: string,
  questionPlan: VerificationQuestionPlanItem[],
  currentIndex: number
): Promise<VerificationAttempt> {
  const { rows } = await client.query(
    `UPDATE verification_attempts SET question_plan = $2, current_index = $3 WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(questionPlan), currentIndex]
  );
  return mapRow(rows[0]);
}

export async function completeAttempt(
  client: PoolClient,
  id: string,
  status: AttemptStatus,
  result: AttemptResult | null,
  evidenceSummary: Record<string, unknown> | null
): Promise<VerificationAttempt> {
  const { rows } = await client.query(
    `UPDATE verification_attempts
       SET status = $2, result = $3, evidence_summary = $4, completed_at = now()
     WHERE id = $1 RETURNING *`,
    [id, status, result, evidenceSummary ? JSON.stringify(evidenceSummary) : null]
  );
  return mapRow(rows[0]);
}
