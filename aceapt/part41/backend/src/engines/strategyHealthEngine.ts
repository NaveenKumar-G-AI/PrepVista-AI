import type { StrategyContext, StrategySignal, StrategyHealth, StrategyHealthDimension, StrategyStatus, DriftReport } from '../types/strategy.js';

function dim(status: StrategyHealthDimension['status'], explanation: string): StrategyHealthDimension {
  return { status, explanation };
}

/**
 * spec #11-12: STRATEGY HEALTH.
 * Six dimensions, each judged on its own evidence — deliberately NOT
 * collapsed into a single blended score (spec: "do not reduce all of this
 * to one simplistic score"). The overall status is derived by rule, not by
 * averaging the six.
 */
export function assessStrategyHealth(ctx: StrategyContext, signals: StrategySignal[], drift: DriftReport): StrategyHealth {
  const has = (code: string) => signals.some((s) => s.code === code);

  const direction: StrategyHealthDimension = !ctx.goal
    ? dim('poor', 'No active target role is set.')
    : dim('good', `Target role is set: ${ctx.goal.targetRole}.`);

  const readiness: StrategyHealthDimension = !ctx.goal
    ? dim('unknown', 'Cannot assess readiness without a target role.')
    : has('evidence_gap')
      ? dim('fair', 'Some required skills still lack solid evidence.')
      : ctx.evidence.length === 0
        ? dim('unknown', 'No evidence recorded yet to assess readiness.')
        : dim('good', 'Evidence currently covers the skills the goal requires.');

  const evidence: StrategyHealthDimension =
    ctx.evidence.length === 0
      ? dim('unknown', 'No evidence has been recorded yet.')
      : has('portfolio_shallow')
        ? dim('fair', 'Evidence exists, but none of it is currently rated strong.')
        : dim('good', `${ctx.evidence.length} piece(s) of evidence on file, including at least one rated strong.`);

  const opportunity: StrategyHealthDimension =
    ctx.opportunities.length === 0
      ? dim('unknown', 'No opportunities are on file yet.')
      : has('application_volume_low')
        ? dim('poor', 'Relevant opportunities exist but application volume is low.')
        : dim('good', 'Application activity is keeping pace with available relevant opportunities.');

  const execution: StrategyHealthDimension = has('execution_stalled')
    ? dim('poor', 'Multiple planned actions have stalled for 3+ weeks.')
    : ctx.recentActions.length === 0
      ? dim('unknown', 'No actions have been planned yet.')
      : dim('good', 'Planned actions are moving through to completion at a reasonable pace.');

  const adaptation: StrategyHealthDimension = has('stale_strategy')
    ? dim('poor', 'New outcomes have come in but the strategy hasn\u2019t been revisited in over 45 days.')
    : !ctx.currentVersion
      ? dim('unknown', 'No strategy version exists yet.')
      : dim('good', 'The strategy has been kept current relative to new outcomes.');

  const overallStatus = deriveOverallStatus({ direction, readiness, evidence, opportunity, execution, adaptation }, drift);

  return {
    direction,
    readiness,
    evidence,
    opportunity,
    execution,
    adaptation,
    overallStatus,
    overallExplanation: explainOverall(overallStatus, drift),
  };
}

function deriveOverallStatus(
  dims: Omit<StrategyHealth, 'overallStatus' | 'overallExplanation'>,
  drift: DriftReport,
): StrategyStatus {
  const values = Object.values(dims);
  const known = values.filter((d) => d.status !== 'unknown');
  if (known.length < 3) return 'insufficient_data';

  if (dims.direction.status === 'poor') return 'shift_recommended';

  const poorCount = known.filter((d) => d.status === 'poor').length;
  if (drift.driftDetected || poorCount >= 2) return 'shift_recommended';
  if (poorCount === 1) return 'needs_attention';

  const fairCount = known.filter((d) => d.status === 'fair').length;
  if (fairCount >= 2) return 'needs_attention';

  return 'on_track';
}

function explainOverall(status: StrategyStatus, drift: DriftReport): string {
  switch (status) {
    case 'insufficient_data':
      return 'Not enough recorded activity yet to judge overall strategy health.';
    case 'shift_recommended':
      return drift.driftDetected
        ? 'Recent activity has drifted from the stated goal, and/or multiple dimensions need attention — worth reviewing the strategy directly.'
        : 'Multiple dimensions need attention at once — worth reviewing the strategy directly rather than patching pieces individually.';
    case 'needs_attention':
      return 'Most of the strategy is intact, but at least one dimension needs attention soon.';
    case 'on_track':
      return 'Direction, evidence, opportunity engagement, and execution are all reasonably aligned.';
  }
}
