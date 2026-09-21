import type { GapType, InterventionType, MasteryState } from '../types.js';

export interface InterventionContext {
  gapType: GapType | null;
  masteryState: MasteryState;
  isDueForReview: boolean;
  isExplorationPick: boolean;
  isDeliberateRepetition: boolean;
  goalIsInterviewPrep: boolean;
  roleFlagsSkillAsPriority: boolean;
  nearMasteryThreshold: boolean; // score is high but not yet verified
}

/**
 * Chooses the intervention TYPE, not just "another coding problem" (Phase
 * 14). Ordered as a priority cascade: scheduling/verification concerns
 * outrank routine gap-driven practice, which outranks generic fallback.
 */
export function selectIntervention(ctx: InterventionContext): { type: InterventionType; reason: string } {
  if (ctx.isDueForReview) {
    return { type: 'SPACED_REVIEW', reason: 'This skill is due for scheduled review to check retention of previously demonstrated mastery.' };
  }
  if (ctx.nearMasteryThreshold) {
    return { type: 'MASTERY_VERIFICATION', reason: 'Evidence suggests mastery is close — an unseen verification challenge will confirm it independently before marking it mastered.' };
  }
  if (ctx.isExplorationPick) {
    return { type: 'EXPLORATION', reason: 'This skill has little or no evidence yet — probing it now avoids only ever practicing already-known gaps.' };
  }
  if (ctx.isDeliberateRepetition) {
    return { type: 'DEBUGGING_CHALLENGE', reason: 'The same mistake pattern has appeared repeatedly — deliberately re-testing it (not random repetition) to confirm the fix stuck.' };
  }

  switch (ctx.gapType) {
    case 'PREREQUISITE_GAP':
      return { type: 'PREREQUISITE_REVIEW', reason: 'A prerequisite skill is under-ready; reinforcing it is higher-leverage than harder practice on the dependent skill.' };
    case 'TRANSFER_GAP':
      return { type: ctx.masteryState === 'UNKNOWN' || ctx.masteryState === 'INTRODUCED' ? 'BRIDGE_CHALLENGE' : 'TRANSFER_CHALLENGE', reason: 'Performance is strong in the standard context but doesn\u2019t yet transfer to unfamiliar framing.' };
    case 'DEBUGGING_GAP':
      return { type: 'DEBUGGING_CHALLENGE', reason: 'Failures are state-management/runtime issues rather than conceptual — debugging practice targets that directly.' };
    case 'COMPLEXITY_GAP':
      return { type: 'COMPLEXITY_CHALLENGE', reason: 'The approach is conceptually right but not efficient enough — practice should stress complexity, not just correctness.' };
    case 'APPLICATION_GAP':
      return { type: 'CONCEPT_APPLICATION', reason: 'The core concept is understood; practice should focus on correctly applying it, especially at boundaries.' };
    case 'KNOWLEDGE_GAP':
      return { type: ctx.goalIsInterviewPrep ? 'INTERVIEW_STYLE_CHALLENGE' : 'DIRECT_PRACTICE', reason: 'Fundamentals need direct reinforcement.' };
    case 'RETENTION_GAP':
      return { type: 'SPACED_REVIEW', reason: 'Performance decayed after a gap — a review challenge re-establishes it rather than treating it as never-learned.' };
    case 'INSUFFICIENT_EVIDENCE':
      return { type: 'EXPLORATION', reason: 'Not enough evidence exists yet to classify this skill\u2019s mastery.' };
    default:
      return {
        type: ctx.roleFlagsSkillAsPriority ? 'ROLE_SPECIFIC_PRACTICE' : ctx.goalIsInterviewPrep ? 'INTERVIEW_STYLE_CHALLENGE' : 'DIRECT_PRACTICE',
        reason: 'No specific gap pattern stands out; continuing steady, role/goal-aligned practice.',
      };
  }
}
