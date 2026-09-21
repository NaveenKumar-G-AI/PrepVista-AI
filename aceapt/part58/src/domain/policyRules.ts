/**
 * Decision policy rules (§105-106, §218-221). Represented as DATA (a list of
 * rules), not hardcoded if/else branching, so new rules can be added without
 * touching code — and so it's obvious at a glance that nothing here is a
 * universal law. These are TRAINING/coaching heuristics only; they are never
 * used to answer a live formal assessment for a student (the API layer and
 * assessmentIntegrityGuard enforce that regardless of what this returns).
 *
 * suggestActionsForTraining() can return MULTIPLE reasonable actions, or none
 * at all when the context doesn't confidently match any rule — that's why
 * decisionQuality.ts's rateActionAppropriateness() only ever rewards a match
 * (HIGH) or stays neutral (MEDIUM/NOT_ASSESSABLE); it never punishes a
 * decision just for not matching one illustrative rule set.
 */
import type { DecisionAction, DecisionPolicy, UncertaintyState } from '../types';

export interface DecisionRuleContext {
  uncertaintyState?: UncertaintyState | null;
  remainingTestTimeSeconds?: number | null;
  questionExpectedTimeSeconds?: number | null;
  elapsedTimeSeconds: number;
  policy?: DecisionPolicy | null;
}

export interface DecisionRule {
  id: string;
  description: string;
  appliesTo: (ctx: DecisionRuleContext) => boolean;
  suggestedActions: DecisionAction[];
}

const LOW_CONFIDENCE_STATES: UncertaintyState[] = ['UNCERTAIN', 'LOW_CONFIDENCE', 'NO_USEFUL_EVIDENCE'];

/**
 * Example rule set mirroring the worked example in the product brief (§218):
 * low confidence + little time remaining + question is expensive relative to
 * that time + negative marking active -> consider moving on. This is a
 * starting example, not a rulebook to hardcode into the product long-term —
 * pass a different `rules` array into suggestActionsForTraining to replace it.
 */
export const EXAMPLE_DECISION_RULES: DecisionRule[] = [
  {
    id: 'move-on-under-pressure-with-penalty',
    description:
      'Low confidence, little time left, this question runs long, and wrong answers cost points: moving on is often reasonable.',
    appliesTo: (ctx) =>
      !!ctx.uncertaintyState &&
      LOW_CONFIDENCE_STATES.includes(ctx.uncertaintyState) &&
      ctx.remainingTestTimeSeconds != null &&
      ctx.questionExpectedTimeSeconds != null &&
      ctx.remainingTestTimeSeconds < ctx.questionExpectedTimeSeconds * 2 &&
      !!ctx.policy &&
      ctx.policy.source === 'VERIFIED' &&
      ctx.policy.wrongPenalty > 0,
    suggestedActions: ['SKIP', 'RETURN_LATER', 'ESTIMATE'],
  },
  {
    id: 'eliminate-before-guessing-no-penalty',
    description:
      'Uncertain, but wrong answers cost nothing: there is little downside to eliminating what you can and attempting.',
    appliesTo: (ctx) =>
      !!ctx.uncertaintyState &&
      LOW_CONFIDENCE_STATES.includes(ctx.uncertaintyState) &&
      !!ctx.policy &&
      ctx.policy.source === 'VERIFIED' &&
      ctx.policy.wrongPenalty === 0,
    suggestedActions: ['ELIMINATE', 'INFORMED_GUESS'],
  },
  {
    id: 'time-overrun-low-confidence',
    description: 'Already well past the expected time on a question you are not confident about.',
    appliesTo: (ctx) =>
      !!ctx.uncertaintyState &&
      LOW_CONFIDENCE_STATES.includes(ctx.uncertaintyState) &&
      ctx.questionExpectedTimeSeconds != null &&
      ctx.elapsedTimeSeconds > ctx.questionExpectedTimeSeconds * 1.5,
    suggestedActions: ['ESTIMATE', 'SKIP', 'RETURN_LATER'],
  },
];

export function suggestActionsForTraining(
  ctx: DecisionRuleContext,
  rules: DecisionRule[] = EXAMPLE_DECISION_RULES
): DecisionAction[] {
  const matched = rules.filter((r) => r.appliesTo(ctx));
  const actions = new Set<DecisionAction>();
  for (const rule of matched) {
    for (const action of rule.suggestedActions) actions.add(action);
  }
  return [...actions];
}
