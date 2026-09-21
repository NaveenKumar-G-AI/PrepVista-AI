import type { PoolClient } from "pg";
import type { MasteryEvidence, EvidenceType } from "../types/index.js";

function mapRow(r: any): MasteryEvidence {
  return {
    id: r.id,
    studentId: r.student_id,
    skillId: r.skill_id,
    questionId: r.question_id,
    evidenceType: r.evidence_type,
    score: Number(r.score),
    difficulty: Number(r.difficulty),
    timed: r.timed,
    timeTakenSeconds: r.time_taken_seconds,
    expectedTimeSeconds: r.expected_time_seconds,
    contextType: r.context_type,
    noveltyLevel: r.novelty_level,
    questionExposureState: r.question_exposure_state,
    source: r.source,
    verificationAttemptId: r.verification_attempt_id,
    metadata: r.metadata,
    createdAt: r.created_at,
  };
}

export interface CreateEvidenceInput {
  id: string;
  studentId: string;
  skillId: string;
  questionId?: string | null;
  evidenceType: EvidenceType;
  score: number;
  difficulty: number;
  timed: boolean;
  timeTakenSeconds?: number | null;
  expectedTimeSeconds?: number | null;
  contextType: MasteryEvidence["contextType"];
  noveltyLevel: MasteryEvidence["noveltyLevel"];
  questionExposureState?: MasteryEvidence["questionExposureState"];
  source: string;
  verificationAttemptId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function createEvidence(client: PoolClient, input: CreateEvidenceInput): Promise<MasteryEvidence> {
  const { rows } = await client.query(
    `INSERT INTO mastery_evidence
       (id, student_id, skill_id, question_id, evidence_type, score, difficulty, timed,
        time_taken_seconds, expected_time_seconds, context_type, novelty_level,
        question_exposure_state, source, verification_attempt_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      input.id,
      input.studentId,
      input.skillId,
      input.questionId ?? null,
      input.evidenceType,
      input.score,
      input.difficulty,
      input.timed,
      input.timeTakenSeconds ?? null,
      input.expectedTimeSeconds ?? null,
      input.contextType,
      input.noveltyLevel,
      input.questionExposureState ?? null,
      input.source,
      input.verificationAttemptId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  );
  return mapRow(rows[0]);
}

/** All evidence for a student+skill, oldest first (the shape every dimension
 *  calculation expects - see services/masteryDecisionService.ts). */
export async function listEvidenceForSkill(client: PoolClient, studentId: string, skillId: string): Promise<MasteryEvidence[]> {
  const { rows } = await client.query(
    `SELECT * FROM mastery_evidence WHERE student_id = $1 AND skill_id = $2 ORDER BY created_at ASC`,
    [studentId, skillId]
  );
  return rows.map(mapRow);
}

export async function listEvidenceForAttempt(client: PoolClient, verificationAttemptId: string): Promise<MasteryEvidence[]> {
  const { rows } = await client.query(
    `SELECT * FROM mastery_evidence WHERE verification_attempt_id = $1 ORDER BY created_at ASC`,
    [verificationAttemptId]
  );
  return rows.map(mapRow);
}
