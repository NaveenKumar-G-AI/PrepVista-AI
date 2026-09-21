import type { DB } from '../db/client.js';
import { config } from '../config/index.js';
import type { Challenge, ContextType, DifficultyLevel, HarnessType, Language } from '../types.js';

interface ChallengeRow {
  id: string; title: string; primary_skill_id: string; difficulty_level: string; difficulty_score: number;
  concept_difficulty: number; implementation_complexity: number; constraint_complexity: number; reasoning_complexity: number; ambiguity: number;
  context_type: string; harness_type: string; languages_supported: string; status: string; is_verification: number;
  prompt: string; function_name: string; transfer_of_challenge_id: string | null;
}

function toChallenge(r: ChallengeRow, secondarySkillIds: string[]): Challenge {
  return {
    id: r.id, title: r.title, primarySkillId: r.primary_skill_id, secondarySkillIds,
    difficultyLevel: r.difficulty_level as DifficultyLevel, difficultyScore: r.difficulty_score,
    conceptDifficulty: r.concept_difficulty, implementationComplexity: r.implementation_complexity,
    constraintComplexity: r.constraint_complexity, reasoningComplexity: r.reasoning_complexity, ambiguity: r.ambiguity,
    contextType: r.context_type as ContextType, harnessType: r.harness_type as HarnessType,
    languagesSupported: JSON.parse(r.languages_supported) as Language[], status: r.status as Challenge['status'],
    isVerification: Boolean(r.is_verification), prompt: r.prompt, functionName: r.function_name,
    transferOfChallengeId: r.transfer_of_challenge_id,
  };
}

export class ChallengeRepository {
  constructor(private db: DB) {}

  getById(challengeId: string): Challenge | null {
    const row = this.db.prepare('SELECT * FROM challenges WHERE id = ?').get(challengeId) as unknown as ChallengeRow | undefined;
    if (!row) return null;
    const secondary = (this.db.prepare('SELECT skill_id FROM challenge_skills WHERE challenge_id = ?').all(challengeId) as unknown as { skill_id: string }[]).map((s) => s.skill_id);
    return toChallenge(row, secondary);
  }

  getAllActive(): Challenge[] {
    const rows = this.db.prepare("SELECT * FROM challenges WHERE status = 'ACTIVE'").all() as unknown as ChallengeRow[];
    return rows.map((r) => {
      const secondary = (this.db.prepare('SELECT skill_id FROM challenge_skills WHERE challenge_id = ?').all(r.id) as unknown as { skill_id: string }[]).map((s) => s.skill_id);
      return toChallenge(r, secondary);
    });
  }

  getTestCases(challengeId: string, language: Language) {
    const rows = this.db
      .prepare('SELECT * FROM challenge_test_cases WHERE challenge_id = ? AND language = ? ORDER BY order_index ASC')
      .all(challengeId, language) as unknown as { id: string; challenge_id: string; language: string; input_json: string; expected_json: string; is_hidden: number; category: string; order_index: number }[];
    return rows.map((r) => ({
      id: r.id, challengeId: r.challenge_id, language: r.language as Language,
      input: JSON.parse(r.input_json), expected: JSON.parse(r.expected_json),
      isHidden: Boolean(r.is_hidden), category: r.category, orderIndex: r.order_index,
    }));
  }
}

export interface CandidateFilterOptions {
  skillId?: string;
  language?: Language;
  difficultyLevel?: DifficultyLevel;
  contextType?: ContextType;
  excludeChallengeIds?: string[];
  allowVerification?: boolean;
}

/**
 * Retrieves candidate challenges from the real challenge table, applying the
 * exclusion rules from Phase 18: active status only, language support,
 * required metadata present (a challenge with zero test cases for the
 * requested language is filtered out as "invalid"), and caller-supplied
 * exclusions (e.g. recently completed).
 */
export class CandidateRetrieval {
  private repo: ChallengeRepository;
  constructor(private db: DB) {
    this.repo = new ChallengeRepository(db);
  }

  retrieve(opts: CandidateFilterOptions): Challenge[] {
    const all = this.repo.getAllActive();
    return all.filter((c) => {
      if (!opts.allowVerification && c.isVerification) return false;
      if (opts.skillId && c.primarySkillId !== opts.skillId && !c.secondarySkillIds.includes(opts.skillId)) return false;
      if (opts.language && !c.languagesSupported.includes(opts.language)) return false;
      if (opts.difficultyLevel && c.difficultyLevel !== opts.difficultyLevel) return false;
      if (opts.contextType && c.contextType !== opts.contextType) return false;
      if (opts.excludeChallengeIds?.includes(c.id)) return false;
      // "invalid tests" guard: a challenge must have at least one test case in a supported language.
      const lang = opts.language ?? c.languagesSupported[0];
      const cases = this.repo.getTestCases(c.id, lang);
      if (cases.length === 0) return false;
      return true;
    });
  }

  /** Challenge IDs the student attempted recently (Phase 22 repetition control), regardless of pass/fail. */
  recentlyAttemptedChallengeIds(studentId: string, withinDays: number = config.ranking.recentExposureExcludeDays): string[] {
    const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = this.db
      .prepare('SELECT DISTINCT challenge_id FROM attempts WHERE student_id = ? AND submitted_at >= ?')
      .all(studentId, since) as unknown as { challenge_id: string }[];
    return rows.map((r) => r.challenge_id);
  }
}
