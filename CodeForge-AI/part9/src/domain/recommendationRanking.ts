import { RECOMMENDATION_WEIGHTS, STATE_RANK, type MasteryState } from './config.js';
import type { NextActionType, Recommendation } from './types.js';

export interface SkillCandidate {
  /** The skill this candidate is actually about practicing next (already resolved by gap diagnosis if it's a prerequisite). */
  skillId: string;
  roleImportance: number; // 0..1, from role_skill_requirements
  currentState: MasteryState;
  targetState: MasteryState; // usually FUNCTIONAL or STRONG depending on the role's required depth
  /** Set when this candidate exists because it's a prerequisite blocking some OTHER skill — carried through for explanation text only. */
  blockingSkillId?: string;
  retentionOverdueDays: number; // 0 if not applicable / not due
  hasTransferEvidence: boolean;
  lastRecommendedDaysAgo: number | null;
  suggestedAction: NextActionType;
}

/**
 * PHASE 20: deterministic, configurable ranking — no single hardcoded
 * formula buried in a controller. Every weight lives in domain/config.ts.
 * PHASE 64: callers should take index 0 as the ONE primary action and at
 * most 2–3 more as secondary options — never dump the whole ranked list
 * on the student.
 */
export function rankRecommendations(candidates: SkillCandidate[]): (Recommendation & { blockingSkillId?: string })[] {
  const scored = candidates.map((c) => {
    const gapSize = Math.max(0, STATE_RANK[c.targetState] - STATE_RANK[c.currentState]) / 6;
    const prerequisiteBonus = c.blockingSkillId ? 1 : 0;
    const retentionRisk = Math.min(1, c.retentionOverdueDays / 14);
    const transferGap = c.hasTransferEvidence ? 0 : 0.5;
    const recencyPenalty = c.lastRecommendedDaysAgo !== null && c.lastRecommendedDaysAgo < 2 ? 1 : 0;

    const score =
      RECOMMENDATION_WEIGHTS.roleImportance * c.roleImportance +
      RECOMMENDATION_WEIGHTS.masteryGap * gapSize +
      RECOMMENDATION_WEIGHTS.prerequisiteBonus * prerequisiteBonus +
      RECOMMENDATION_WEIGHTS.retentionRisk * retentionRisk +
      RECOMMENDATION_WEIGHTS.transferGap * transferGap -
      RECOMMENDATION_WEIGHTS.recencyPenalty * recencyPenalty;

    return { c, score: Math.max(0, score) };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map(({ c, score }, i) => ({
    skillId: c.skillId,
    actionType: c.suggestedAction,
    priorityScore: Math.round(score * 1000) / 1000,
    isPrimary: i === 0,
    blockingSkillId: c.blockingSkillId,
    reasons: [],
    expectedOutcome: '',
  }));
}
