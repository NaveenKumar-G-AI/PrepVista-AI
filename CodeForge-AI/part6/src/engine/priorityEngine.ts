import { GAP_SEVERITY_WEIGHT, PRIORITY_TIER_WEIGHT, PRIORITY_WEIGHTS, URGENCY_BASELINE_DAYS } from '../config';
import type { GapStatus, PriorityBreakdown, PriorityTier, Trend } from '../domain/types';

export interface PriorityInput {
  priorityTier: PriorityTier;
  gapStatus: GapStatus;
  required: boolean;
  blockingPowerNormalized: number; // 0..1, already normalized by caller against max in graph
  daysRemaining: number | null; // null if no target date set
  trend: Trend | null;
}

function daysToUrgency(daysRemaining: number | null): number {
  if (daysRemaining === null) return 0;
  if (daysRemaining <= 0) return 1;
  const factor = 1 - daysRemaining / URGENCY_BASELINE_DAYS;
  return Math.max(0, Math.min(1, factor));
}

/**
 * Pure, deterministic, and fully explainable: the AI layer never touches
 * this calculation (Phase 9 explicitly forbids hiding priority inside an
 * LLM). Every factor's raw value, weight, and contribution is returned so
 * the explanation engine can cite exact numbers.
 */
export function computePriority(input: PriorityInput): { score: number; breakdown: PriorityBreakdown } {
  const roleValue = PRIORITY_TIER_WEIGHT[input.priorityTier];
  const gapValue = GAP_SEVERITY_WEIGHT[input.gapStatus];
  const blockValue = input.blockingPowerNormalized;
  const requiredValue = input.required ? 1 : 0.3;
  const urgencyRaw = daysToUrgency(input.daysRemaining);
  // Urgency only meaningfully amplifies required skills — an optional,
  // low-priority skill shouldn't jump the queue just because a deadline is
  // near (Phase 19: reprioritize *critical* skills under time pressure).
  const urgencyValue = urgencyRaw * requiredValue;
  const trendValue = input.trend === 'DECLINING' ? 1 : 0;

  const role = { value: roleValue, weight: PRIORITY_WEIGHTS.role, contribution: roleValue * PRIORITY_WEIGHTS.role };
  const gap = { value: gapValue, weight: PRIORITY_WEIGHTS.gap, contribution: gapValue * PRIORITY_WEIGHTS.gap };
  const block = {
    value: blockValue,
    weight: PRIORITY_WEIGHTS.block,
    contribution: blockValue * PRIORITY_WEIGHTS.block,
  };
  const required = {
    value: requiredValue,
    weight: PRIORITY_WEIGHTS.required,
    contribution: requiredValue * PRIORITY_WEIGHTS.required,
  };
  const urgency = {
    value: urgencyValue,
    weight: PRIORITY_WEIGHTS.urgency,
    contribution: urgencyValue * PRIORITY_WEIGHTS.urgency,
  };
  const trend = {
    value: trendValue,
    weight: PRIORITY_WEIGHTS.trend,
    contribution: trendValue * PRIORITY_WEIGHTS.trend,
  };

  const total = role.contribution + gap.contribution + block.contribution + required.contribution + urgency.contribution + trend.contribution;

  return {
    score: total,
    breakdown: { role, gap, block, required, urgency, trend, total },
  };
}
