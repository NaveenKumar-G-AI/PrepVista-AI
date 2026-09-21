import type { PoolClient } from "pg";
import type { QuestionExposure, ExposureState } from "../types/index.js";
import { getMasteryModelConfig } from "../config/masteryModel.js";

function mapRow(r: any): QuestionExposure {
  return {
    id: r.id,
    studentId: r.student_id,
    questionId: r.question_id,
    state: r.state,
    seenCount: r.seen_count,
    lastSeenAt: r.last_seen_at,
    lastWasCorrect: r.last_was_correct,
  };
}

export async function getExposure(client: PoolClient, studentId: string, questionId: string): Promise<QuestionExposure | null> {
  const { rows } = await client.query(
    `SELECT * FROM question_exposures WHERE student_id = $1 AND question_id = $2`,
    [studentId, questionId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Records that a student has just seen/answered a specific question, and
 * returns the resulting exposure state. This is the anti-memorization gate
 * (spec section 26): the SECOND exact repeat of the same question id flips
 * the state to MEMORIZATION_RISK, which downstream MasteryEvidence rows
 * reference via question_exposure_state so the decision engine can exclude
 * or down-weight them rather than letting repeated exposure to one fixed
 * question inflate mastery evidence.
 */
export async function recordExposure(
  client: PoolClient,
  input: { id: string; studentId: string; questionId: string; wasCorrect: boolean }
): Promise<QuestionExposure> {
  const config = getMasteryModelConfig();
  const existing = await getExposure(client, input.studentId, input.questionId);

  let nextState: ExposureState = "SEEN";
  let nextSeenCount = 1;

  if (existing) {
    nextSeenCount = existing.seenCount + 1;
    nextState =
      nextSeenCount >= config.exposure.memorizationRiskAfterExactRepeats + 1
        ? "MEMORIZATION_RISK"
        : "REPEATED";
  } else {
    nextState = "SEEN";
  }

  const { rows } = await client.query(
    `INSERT INTO question_exposures (id, student_id, question_id, state, seen_count, last_seen_at, last_was_correct)
     VALUES ($1,$2,$3,$4,$5, now(), $6)
     ON CONFLICT (student_id, question_id) DO UPDATE SET
       state = EXCLUDED.state,
       seen_count = EXCLUDED.seen_count,
       last_seen_at = now(),
       last_was_correct = EXCLUDED.last_was_correct
     RETURNING *`,
    [input.id, input.studentId, input.questionId, nextState, nextSeenCount, input.wasCorrect]
  );
  return mapRow(rows[0]);
}
