import type { FailureCategory, Reassessment, RecoveryPlan } from '../types';

// Section 18 — if the same category was already targeted by a completed plan
// that did not show a clear improvement, say so instead of recommending the
// same generic thing again.
export function detectSameMistake(
  priorPlans: RecoveryPlan[],
  priorReassessments: Reassessment[],
  category: FailureCategory,
): boolean {
  const sameCategoryCompleted = priorPlans.filter((p) => p.failureCategory === category && p.status === 'completed');
  return sameCategoryCompleted.some((plan) => {
    const results = priorReassessments.filter((r) => r.recoveryPlanId === plan.id);
    return results.some((r) => r.result === 'no_change' || r.result === 'unclear');
  });
}
