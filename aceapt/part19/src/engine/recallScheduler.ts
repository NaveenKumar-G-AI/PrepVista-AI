// ============================================================================
// Personalized recall scheduler.
//
// Not "review all topics Sunday." Each student gets their own ranked,
// capped list based on their own risk states — this powers the
// "Today's Memory Check" card.
// ============================================================================

import { KnowledgeState, ReviewPlan, ReviewPlanItem, RISK_SEVERITY } from '../domain/types';

// 2 concepts ≈ 3 minutes in the product brief's own example — this constant
// reproduces that estimate exactly.
const MINUTES_PER_ITEM = 1.5;
const DAILY_CAP = 3;

const ELIGIBLE_STATES = new Set<KnowledgeState['riskState']>([
  'MONITOR',
  'WEAKENING',
  'AT_RISK',
  'REACTIVATION_REQUIRED',
]);

export function buildReviewPlan(studentId: string, states: KnowledgeState[], now: string): ReviewPlan {
  const items: ReviewPlanItem[] = states
    .filter(s => ELIGIBLE_STATES.has(s.riskState))
    .map(s => {
      const severity = RISK_SEVERITY[s.riskState];
      const strengthPenalty = s.strengthBand === 'WEAK' ? 0.2 : s.strengthBand === 'MODERATE' ? 0.1 : 0;
      const priorityScore = Number(Math.min(1, severity / 5 + strengthPenalty).toFixed(3));
      return { conceptId: s.conceptId, priorityScore, reason: s.riskState };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, DAILY_CAP);

  return {
    studentId,
    generatedAt: now,
    items,
    estimatedMinutes: items.length ? Math.max(1, Math.round(items.length * MINUTES_PER_ITEM)) : 0,
  };
}
