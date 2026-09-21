import { PoolClient } from 'pg';
import { CompetencyWeight, DifficultyDistribution } from '../types';

export interface SelectedChallenge {
  challenge_id: string;
  skill_id: string;
  weight: number;
  is_unseen: boolean;
  is_transfer_probe: boolean;
  difficulty: string;
  language: string;
}

function sampleDifficulty(dist: DifficultyDistribution): string {
  const r = Math.random();
  if (r < dist.easy) return 'easy';
  if (r < dist.easy + dist.medium) return 'medium';
  return 'hard';
}

/**
 * Selects one challenge per weighted competency, from the EXISTING
 * challenge bank only (section 13 — no second challenge database). Prefers
 * challenges the student has neither solved in practice nor already seen in
 * an assessment (section 15), only ever validated challenges, and loosely
 * follows the blueprint's difficulty distribution (falling back to any
 * difficulty if none exists at the sampled tier — an explainable gap, not a
 * crash, per section 69). Heavier-weighted competencies are selected first
 * so they get first claim on any unseen challenges.
 */
export async function selectChallenges(
  client: PoolClient,
  studentId: string,
  competencyWeights: CompetencyWeight[],
  difficultyDistribution: DifficultyDistribution,
  language: string
): Promise<SelectedChallenge[]> {
  const selected: SelectedChallenge[] = [];
  const sortedWeights = [...competencyWeights].sort((a, b) => b.weight - a.weight);

  for (const w of sortedWeights) {
    const targetDifficulty = sampleDifficulty(difficultyDistribution);

    const pick = async (enforceDifficulty: boolean) =>
      client.query(
        `SELECT c.id AS challenge_id, c.difficulty, c.language,
                (ce.challenge_id IS NULL OR (ce.solved_in_practice_at IS NULL AND ce.times_used_in_assessment = 0)) AS is_unseen
         FROM challenges c
         LEFT JOIN challenge_exposure ce ON ce.challenge_id = c.id AND ce.student_id = $2
         WHERE c.skill_id = $1 AND c.is_validated = true AND c.language = $3
           ${enforceDifficulty ? 'AND c.difficulty = $4' : ''}
         ORDER BY is_unseen DESC, random()
         LIMIT 1`,
        enforceDifficulty ? [w.skill_id, studentId, language, targetDifficulty] : [w.skill_id, studentId, language]
      );

    let { rows } = await pick(true);
    if (rows.length === 0) {
      ({ rows } = await pick(false)); // fall back across difficulty if the sampled tier has nothing valid
    }
    if (rows.length === 0) continue; // no valid challenge exists for this skill/language at all — leave a real gap rather than fabricate one

    const row = rows[0];
    selected.push({
      challenge_id: row.challenge_id,
      skill_id: w.skill_id,
      weight: w.weight,
      is_unseen: row.is_unseen,
      is_transfer_probe: false,
      difficulty: row.difficulty,
      language: row.language,
    });
  }

  // Mark the highest-weighted UNSEEN pick as the transfer probe (section 37) — measures transfer, not memorization.
  const transferCandidate = selected.find((s) => s.is_unseen);
  if (transferCandidate) transferCandidate.is_transfer_probe = true;

  return selected;
}
