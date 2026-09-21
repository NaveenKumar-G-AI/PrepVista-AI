import { config } from '../config/index.js';
import type { Challenge, DifficultyLevel, GapType, Priority } from '../types.js';

export interface RankingContext {
  targetSkillId: string;
  gapType: GapType | null;
  gapSeverity: number;               // 0-1
  targetDifficultyLevel: DifficultyLevel;
  rolePriority: Priority | null;     // priority of the target skill for the student's role, if any
  goalBoostsSkillGap: boolean;       // e.g. DSA_MASTERY / PLACEMENT_PREPARATION goals
  goalPrefersInterviewStyle: boolean;
  recentlyAttemptedChallengeIds: string[];
  deliberateRepetitionChallengeId: string | null; // when set, THIS challenge is intentionally being re-served (Phase 23) and should not be repetition-penalized
  skillHasDueReview: boolean;
  isTransferTarget: boolean;         // true when the gap is TRANSFER_GAP and we want a NOVEL-context challenge
  recentlyTargetedSkillIds: string[]; // for interleaving/diversity scoring
}

export interface RankedCandidate {
  challenge: Challenge;
  score: number;
  breakdown: Record<string, number>;
}

const DIFFICULTY_ORDER: DifficultyLevel[] = ['EASY', 'MEDIUM', 'HARD', 'ADVANCED'];
const PRIORITY_VALUE: Record<Priority, number> = { LOW: 0.25, MEDIUM: 0.5, HIGH: 0.75, VERY_HIGH: 1.0 };

function difficultyFit(challengeLevel: DifficultyLevel, targetLevel: DifficultyLevel): number {
  const dist = Math.abs(DIFFICULTY_ORDER.indexOf(challengeLevel) - DIFFICULTY_ORDER.indexOf(targetLevel));
  return Math.max(0, 1 - dist / (DIFFICULTY_ORDER.length - 1));
}

/**
 * Scores one candidate challenge against the current recommendation context.
 * Every signal is a plain, inspectable number (Phase 19) — nothing here is
 * delegated to an LLM. The weighted sum uses config.ranking.weights, so
 * re-tuning behavior never requires touching this function.
 */
export function scoreCandidate(challenge: Challenge, ctx: RankingContext): RankedCandidate {
  const w = config.ranking.weights;
  const breakdown: Record<string, number> = {};

  const touchesTarget = challenge.primarySkillId === ctx.targetSkillId || challenge.secondarySkillIds.includes(ctx.targetSkillId);
  breakdown.skillGap = touchesTarget ? ctx.gapSeverity : 0;

  breakdown.prerequisiteFit = ctx.gapType === 'PREREQUISITE_GAP' && touchesTarget ? 1 : touchesTarget ? 0.6 : 0.3;

  breakdown.difficultyFit = difficultyFit(challenge.difficultyLevel, ctx.targetDifficultyLevel);

  breakdown.roleRelevance = ctx.rolePriority ? PRIORITY_VALUE[ctx.rolePriority] : 0.3;

  breakdown.goalRelevance = (ctx.goalBoostsSkillGap && touchesTarget ? 0.7 : 0.3)
    + (ctx.goalPrefersInterviewStyle ? 0.3 : 0);
  breakdown.goalRelevance = Math.min(1, breakdown.goalRelevance);

  breakdown.learningValue = touchesTarget ? (0.5 + 0.5 * ctx.gapSeverity) : 0.2;

  const alreadyAttempted = ctx.recentlyAttemptedChallengeIds.includes(challenge.id);
  breakdown.freshness = alreadyAttempted && challenge.id !== ctx.deliberateRepetitionChallengeId ? 0.1 : 1;

  const skillRecentlyTargeted = ctx.recentlyTargetedSkillIds.includes(challenge.primarySkillId);
  breakdown.diversity = skillRecentlyTargeted ? 0.3 : 1;

  breakdown.mistakeRelevance = ctx.isTransferTarget ? (challenge.contextType === 'NOVEL' ? 1 : 0.2) : (touchesTarget ? 0.7 : 0.2);

  breakdown.retentionValue = ctx.skillHasDueReview && touchesTarget ? 1 : 0.2;

  breakdown.repetitionPenalty = alreadyAttempted && challenge.id !== ctx.deliberateRepetitionChallengeId ? 1 : 0;

  const score =
    w.skillGap * breakdown.skillGap +
    w.prerequisiteFit * breakdown.prerequisiteFit +
    w.difficultyFit * breakdown.difficultyFit +
    w.roleRelevance * breakdown.roleRelevance +
    w.goalRelevance * breakdown.goalRelevance +
    w.learningValue * breakdown.learningValue +
    w.freshness * breakdown.freshness +
    w.diversity * breakdown.diversity +
    w.mistakeRelevance * breakdown.mistakeRelevance +
    w.retentionValue * breakdown.retentionValue -
    w.repetitionPenalty * breakdown.repetitionPenalty;

  return { challenge, score: Math.round(score * 1000) / 1000, breakdown };
}

export function rankCandidates(challenges: Challenge[], ctx: RankingContext): RankedCandidate[] {
  return challenges.map((c) => scoreCandidate(c, ctx)).sort((a, b) => b.score - a.score);
}
