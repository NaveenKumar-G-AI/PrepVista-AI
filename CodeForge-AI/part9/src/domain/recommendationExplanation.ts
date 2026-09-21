import type { GapDiagnosis, MasteryResult, NextActionType, Recommendation } from './types.js';

/**
 * PHASE 21 / 62 / 84: build the "why" from the same facts used to rank the
 * recommendation, in plain student-facing language — never a free-floating
 * AI guess, and never "AI recommends this" with no reasons. An AIProvider
 * may later be used purely to smooth the PROSE of these strings; the facts
 * themselves are fixed here and don't change if AI rewrites the wording.
 */
export function explainRecommendation(
  rec: Recommendation,
  mastery: MasteryResult,
  gap: GapDiagnosis | null,
  roleName: string
): Recommendation {
  const reasons: string[] = [];
  reasons.push(`${roleName} requires this skill.`);
  reasons.push(`Current evidence puts this skill at ${mastery.state} (confidence ${(mastery.confidence * 100).toFixed(0)}%).`);

  if (gap && gap.category === 'PREREQUISITE_GAP') {
    reasons.push(...gap.reasons);
  } else if (gap && gap.category !== 'NEEDS_REVIEW') {
    reasons.push(`Recent attempts point to a ${gap.category.replace(/_/g, ' ').toLowerCase()}.`);
  }
  reasons.push(...mastery.reasons);

  return { ...rec, reasons, expectedOutcome: deriveExpectedOutcome(rec.actionType) };
}

function deriveExpectedOutcome(actionType: NextActionType): string {
  const map: Record<NextActionType, string> = {
    LEARN_CONCEPT: 'Understand the core idea well enough to attempt a guided problem.',
    GUIDED_PRACTICE: 'Apply the idea with support, building toward an independent attempt.',
    INDEPENDENT_PRACTICE: 'Solve a problem on this skill without hints or guidance.',
    TRANSFER_PRACTICE: 'Recognize this skill applies to an unfamiliar problem without being told.',
    DEBUGGING_PRACTICE: 'Independently find and fix the specific class of bug seen recently.',
    TIMED_CHALLENGE: 'Perform reliably under time pressure.',
    RETENTION_CHECK: 'Confirm the skill is still solid after time has passed.',
    VERIFICATION: 'Provide strong enough evidence to move this skill to the next mastery state.',
    TECHNICAL_INTERVIEW: 'Demonstrate this skill in an interview-realistic setting.',
    REVIEW_PREREQUISITE: 'Shore up the underlying skill that is currently blocking progress.',
    LANGUAGE_PRACTICE: 'Build fluency implementing this concept in the target language.',
  };
  return map[actionType] ?? 'Build stronger evidence for this skill.';
}
