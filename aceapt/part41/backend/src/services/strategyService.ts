import type { ID } from '../types/domain.js';
import type { CommandCenterView, TimelineEntry } from '../types/strategy.js';
import type { ContextSourceRepository, StrategyStore } from '../repositories/types.js';
import type { LLMProvider } from '../ai/llmProvider.js';

import { buildStrategyContext, assessDataSufficiency } from '../engines/contextBuilder.js';
import { extractSignals } from '../engines/signalEngine.js';
import { checkConstraints, detectDrift } from '../engines/guardEngines.js';
import { detectPrimaryBottleneck } from '../engines/bottleneckEngine.js';
import { determineNextBestMove } from '../engines/nextBestMoveEngine.js';
import { assessStrategyHealth } from '../engines/strategyHealthEngine.js';
import { assessMomentum } from '../engines/momentumEngine.js';
import { generateNextBestMoveRecommendation } from './narrativeServices.js';
import { eventBus } from '../events/eventBus.js';

/**
 * PHASES 2-7 of the AI pipeline (spec #52), orchestrated: CONTEXT BUILDER →
 * SIGNAL EXTRACTION → CONSTRAINT CHECK → DECISION/STRATEGY ENGINE →
 * RECOMMENDATION GENERATOR. This is the single entry point the
 * Command-Center route calls; it does not duplicate logic that belongs in
 * the individual engines (spec #44: orchestration principle).
 */
export async function buildCommandCenterView(
  studentId: ID,
  sources: ContextSourceRepository,
  store: StrategyStore,
  llm: LLMProvider,
): Promise<CommandCenterView> {
  const ctx = await buildStrategyContext(studentId, sources, store);
  const dataSufficiency = assessDataSufficiency(ctx);
  const asOf = ctx.asOf;

  if (dataSufficiency === 'empty') {
    return emptyView(asOf, ctx.currentStrategy?.status ?? 'insufficient_data');
  }

  const signals = extractSignals(ctx);
  const bottleneck = detectPrimaryBottleneck(ctx, signals);
  const drift = detectDrift(ctx);
  const alreadyPlanned = ctx.recentActions.filter((a) => a.status === 'accepted' || a.status === 'in_progress').map((a) => a.kind);
  const constraintCheck = checkConstraints(ctx, alreadyPlanned);
  const nextBestMove = determineNextBestMove(ctx, signals, bottleneck);
  const strategyHealth = assessStrategyHealth(ctx, signals, drift);
  const momentum = assessMomentum(ctx);

  if (bottleneck) {
    await store.saveBottleneck(ctx.currentStrategy!.id, bottleneck);
    eventBus.publish('bottleneck_detected', { studentId, strategyId: ctx.currentStrategy!.id, category: bottleneck.category });
  }
  await store.updateStrategyStatus(ctx.currentStrategy!.id, strategyHealth.overallStatus);

  const recommendation = nextBestMove
    ? await generateNextBestMoveRecommendation(ctx, bottleneck, nextBestMove, store, llm)
    : null;

  const focus = nextBestMove
    ? [{ title: nextBestMove.title, tier: nextBestMove.tier }, ...nextBestMove.alternatives.slice(0, 2).map((a) => ({ title: a.title, tier: a.tier }))]
    : [];

  return {
    currentPosition: describeCurrentPosition(ctx),
    target: ctx.goal?.targetRole ?? 'Not set',
    strategyStatus: strategyHealth.overallStatus,
    biggestGap: bottleneck?.description ?? 'No corroborated gap stands out right now.',
    biggestOpportunity: describeBiggestOpportunity(ctx),
    biggestRisk: describeBiggestRisk(signals, constraintCheck),
    bottleneck,
    nextBestMove,
    strategyHealth,
    momentum,
    focus: focus.slice(0, 3),
    constraintCheck,
    drift,
    dataSufficiency,
    recommendation,
    asOf,
  };
}

function describeCurrentPosition(ctx: { evidence: unknown[]; applications: unknown[] }): string {
  return `${ctx.evidence.length} piece(s) of evidence and ${ctx.applications.length} application(s) on file.`;
}

function describeBiggestOpportunity(ctx: { opportunities: { applied: boolean; relevanceToGoal: number; title: string }[] }): string {
  const open = ctx.opportunities.filter((o) => !o.applied).sort((a, b) => b.relevanceToGoal - a.relevanceToGoal);
  if (open.length === 0) return 'No open relevant opportunities on file right now.';
  return `"${open[0]!.title}" (${Math.round(open[0]!.relevanceToGoal * 100)}% relevance).`;
}

function describeBiggestRisk(
  signals: { code: string; detail: string; weight: number }[],
  constraintCheck: { overcommitted: boolean; violations: string[] },
): string {
  if (constraintCheck.overcommitted) return constraintCheck.violations[0] ?? 'Current plan does not fit stated constraints.';
  const risky = [...signals.filter((s) => s.code.includes('conversion') || s.code.includes('stalled'))].sort((a, b) => b.weight - a.weight)[0];
  return risky?.detail ?? 'No single dominant risk identified right now.';
}

function emptyView(asOf: string, status: CommandCenterView['strategyStatus']): CommandCenterView {
  return {
    currentPosition: 'No strategy data yet.',
    target: 'Not set',
    strategyStatus: status,
    biggestGap: 'Set a target role to get started.',
    biggestOpportunity: 'Not enough data yet.',
    biggestRisk: 'Not enough data yet.',
    bottleneck: null,
    nextBestMove: null,
    strategyHealth: {
      direction: { status: 'unknown', explanation: 'No target role set.' },
      readiness: { status: 'unknown', explanation: 'No target role set.' },
      evidence: { status: 'unknown', explanation: 'No evidence recorded.' },
      opportunity: { status: 'unknown', explanation: 'No opportunities recorded.' },
      execution: { status: 'unknown', explanation: 'No actions recorded.' },
      adaptation: { status: 'unknown', explanation: 'No strategy version exists yet.' },
      overallStatus: 'insufficient_data',
      overallExplanation: 'This is a new strategy — nothing has been recorded yet.',
    },
    momentum: { trend: 'unknown', drivers: [] },
    focus: [],
    constraintCheck: { ok: true, availableHoursPerWeek: null, plannedHoursPerWeek: 0, violations: [], overcommitted: false },
    drift: { driftDetected: false, overlapRatio: null, disconnectedActions: [], explanation: 'Not enough data.' },
    dataSufficiency: 'empty',
    recommendation: null,
    asOf,
  };
}

/** spec #79: assembles the Career Strategy Timeline from versions, actions,
 * experiments, and reviews rather than a dedicated table (spec #60's model
 * still holds — this just reads across the tables that already carry dates). */
export async function buildTimeline(strategyId: ID, store: StrategyStore): Promise<TimelineEntry[]> {
  const [versions, actions, experiments, reviews] = await Promise.all([
    store.listVersions(strategyId),
    store.listActions(strategyId),
    store.listExperiments(strategyId),
    store.listReviews(strategyId),
  ]);

  const entries: TimelineEntry[] = [];
  for (const v of versions) {
    entries.push({ at: v.createdAt, kind: v.versionNumber === 1 ? 'strategy_created' : 'strategy_version', label: `Strategy v${v.versionNumber}: ${v.targetRole}`, detail: v.reason });
  }
  for (const a of actions) {
    entries.push({ at: a.createdAt, kind: 'action', label: a.title, detail: `status: ${a.status}` });
    if (a.completedAt) entries.push({ at: a.completedAt, kind: 'outcome', label: `Completed: ${a.title}` });
  }
  for (const e of experiments) {
    entries.push({ at: e.createdAt, kind: 'experiment', label: `Experiment: ${e.hypothesis}`, detail: e.status });
  }
  for (const r of reviews) {
    entries.push({ at: r.createdAt, kind: 'review', label: 'Weekly strategy review', detail: r.nextPriority });
  }

  return entries.sort((a, b) => a.at.localeCompare(b.at));
}
