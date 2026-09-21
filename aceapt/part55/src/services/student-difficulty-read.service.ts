import type pg from 'pg';
import { withTenant } from '../db/pool.js';
import type { DifficultyModeT } from '../types/difficulty.types.js';

export interface StudentDifficultyView {
  questionVersionId: string;
  category: 'EASY' | 'MEDIUM' | 'HARD' | null;
  isWellEstablished: boolean;
}

export type PersonalChallengeLevel = 'BELOW_LEVEL' | 'AT_LEVEL' | 'STRETCH';

/**
 * §115, §156-157: the ONLY read path student-facing endpoints are allowed to
 * use. It runs on `studentPool` (connected as difficulty_student_app, see
 * migrations/002_roles_and_rls.sql), which the database itself restricts to
 * a handful of safe columns on student_difficulty_view — facility, sample
 * size, and every other evidence column are unreachable here even if this
 * code had a bug, because Postgres, not this file, is the actual boundary
 * (verified live — see scripts/verify-rls.sh and the README "Bugs found and
 * fixed" section).
 */
export class StudentDifficultyReadService {
  constructor(private readonly studentPool: pg.Pool) {}

  async getDifficulty(
    tenantId: string,
    questionVersionId: string,
    populationId = 'default',
    mode: DifficultyModeT = 'OVERALL'
  ): Promise<StudentDifficultyView | null> {
    return withTenant(this.studentPool, tenantId, async (client) => {
      const { rows } = await client.query<{
        question_version_id: string;
        category: 'EASY' | 'MEDIUM' | 'HARD' | null;
        is_well_established: boolean;
      }>(
        `SELECT question_version_id, category, is_well_established
         FROM student_difficulty_view
         WHERE question_version_id = $1 AND population_id = $2 AND mode::text = $3`,
        [questionVersionId, populationId, mode]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        questionVersionId: row.question_version_id,
        category: row.category,
        isWellEstablished: row.is_well_established,
      };
    });
  }
}

/**
 * §79, §116, §171: "Medium globally, but this student's demonstrated level
 * is High -> Easy for this student" — WITHOUT ever touching the question's
 * global calibration. Feature 55 doesn't compute student ability (that's
 * mastery/Feature 43's job); this is a pure, stateless mapping the caller
 * feeds a coarse ability bucket into.
 */
export function derivePersonalChallenge(
  category: 'EASY' | 'MEDIUM' | 'HARD' | null,
  studentAbilityBucket: 'BELOW' | 'AT' | 'ABOVE' | null
): PersonalChallengeLevel | null {
  if (!category || !studentAbilityBucket) return null;
  const rank = { EASY: 0, MEDIUM: 1, HARD: 2 }[category];
  const abilityRank = { BELOW: 0, AT: 1, ABOVE: 2 }[studentAbilityBucket];
  const gap = rank - abilityRank;
  if (gap >= 1) return 'STRETCH';
  if (gap <= -1) return 'BELOW_LEVEL';
  return 'AT_LEVEL';
}
