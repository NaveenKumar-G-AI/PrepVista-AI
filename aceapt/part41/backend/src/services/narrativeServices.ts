import type { StrategyContext, Bottleneck, NextBestMove, Recommendation, StrategyReview } from '../types/strategy.js';
import type { StrategyStore } from '../repositories/types.js';
import type { LLMProvider } from '../ai/llmProvider.js';
import { SYSTEM_PROMPT, buildUserPrompt, parseAndValidate, safetyCheck, type AIRecommendationOutput } from '../ai/pipeline.js';
import { eventBus } from '../events/eventBus.js';

/**
 * PHASE 8 of the AI pipeline (spec #52): RECOMMENDATION GENERATOR +
 * SAFETY/HALLUCINATION CHECK, with a deterministic fallback so the student
 * always gets a real explanation even when the LLM is unavailable or its
 * output fails validation (spec #76 "AI unavailable", #72 fallback_rate).
 */
export async function generateNextBestMoveRecommendation(
  ctx: StrategyContext,
  bottleneck: Bottleneck | null,
  nextBestMove: NextBestMove,
  store: StrategyStore,
  llm: LLMProvider,
): Promise<Recommendation> {
  let output: AIRecommendationOutput | null = null;
  let generatedByLLM = false;

  if (llm.isAvailable) {
    try {
      const raw = await llm.complete(SYSTEM_PROMPT, buildUserPrompt(ctx, bottleneck, nextBestMove));
      const parsed = parseAndValidate(raw);
      const safety = safetyCheck(parsed);
      if (safety.ok) {
        output = parsed;
        generatedByLLM = true;
      }
      // If validation or the safety check fails, we deliberately fall through
      // to the deterministic template below rather than showing a broken or
      // unsafe explanation.
    } catch {
      // LLM call failed (network, auth, malformed JSON, etc.) — fall through.
    }
  }

  if (!output) {
    output = deterministicFallback(ctx, bottleneck, nextBestMove);
  }

  const strategyId = ctx.currentStrategy!.id;
  const recommendation = await store.saveRecommendation({
    strategyId,
    type: nextBestMove.requiresConfirmation ? 'strategy_change' : 'next_best_move',
    summary: output.summary,
    reason: output.reason,
    confidence: output.confidence,
    evidence: output.evidence,
    unknowns: output.unknowns,
    risks: output.risks,
    alternatives: output.alternatives,
    conditions: output.conditions,
    strategyImpact: output.strategy_impact,
    requiresConfirmation: output.requires_confirmation || nextBestMove.requiresConfirmation,
    generatedByLLM,
  });

  eventBus.publish('recommendation_generated', { strategyId, recommendationId: recommendation.id, generatedByLLM });
  return recommendation;
}

/** Template-based explanation used whenever the LLM is unavailable or its
 * output doesn't pass validation. Built entirely from the engine's own
 * (already-computed) fields — no fabrication, just phrasing. */
function deterministicFallback(ctx: StrategyContext, bottleneck: Bottleneck | null, move: NextBestMove): AIRecommendationOutput {
  return {
    summary: move.title,
    bottleneck: bottleneck?.description ?? 'No single corroborated bottleneck right now.',
    next_best_move: move.title,
    reason: move.reasoning,
    confidence: move.tier === 'high' ? 'high' : move.tier === 'medium' ? 'medium' : 'low',
    evidence: move.evidence,
    unknowns: bottleneck?.cascade?.unknowns ?? [],
    risks: move.blockedByConstraints ? ['This move does not currently fit the stated time/other constraints.'] : [],
    alternatives: move.alternatives.map((a) => a.title),
    conditions: [],
    strategy_impact: move.requiresConfirmation ? 'This would represent a change to the current target role.' : 'Consistent with the current strategy.',
    requires_confirmation: move.requiresConfirmation,
  };
}

const REVIEW_WINDOW_DAYS = 7;

/** spec #24: WEEKLY CAREER REVIEW. Built entirely from recorded data for the
 * period — this does not call the LLM, since it's a factual rollup rather
 * than a judgment call. */
export async function generateStrategyReview(ctx: StrategyContext, store: StrategyStore): Promise<StrategyReview> {
  const strategyId = ctx.currentStrategy!.id;
  const now = new Date(ctx.asOf);
  const periodStart = new Date(now.getTime() - REVIEW_WINDOW_DAYS * 86400000);

  const inPeriod = (d: string) => { const t = new Date(d); return t >= periodStart && t <= now; };

  const decisions = ctx.recentDecisions.filter((d) => inPeriod(d.createdAt)).map((d) => d.question);
  const actionsThisPeriod = ctx.recentActions.filter((a) => inPeriod(a.createdAt) || (a.completedAt && inPeriod(a.completedAt)));
  const completed = actionsThisPeriod.filter((a) => a.status === 'completed').map((a) => a.title);
  const blocked = actionsThisPeriod.filter((a) => ['suggested', 'accepted', 'in_progress'].includes(a.status)).map((a) => a.title);
  const outcomes = ctx.recentOutcomes.filter((o) => inPeriod(o.recordedAt)).map((o) => o.actual ?? o.expected ?? 'Outcome recorded').filter(Boolean) as string[];
  const newOpportunities = ctx.opportunities.filter((o) => !o.applied && o.relevanceToGoal >= 0.5).map((o) => o.title);

  const lessons: string[] = [];
  for (const o of ctx.recentOutcomes.filter((o) => inPeriod(o.recordedAt))) {
    if (o.expected && o.actual && o.expected !== o.actual) {
      lessons.push(`Expected "${o.expected}" but observed "${o.actual}".`);
    }
  }

  const nextPriority = blocked[0] ?? completed[0] ?? 'Review the current strategy — little recorded activity this period.';

  const review = await store.saveReview({
    strategyId,
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    progress: `${completed.length} action(s) completed, ${blocked.length} still open.`,
    decisions,
    actions: actionsThisPeriod.map((a) => a.title),
    outcomes,
    blockers: blocked,
    newOpportunities,
    lessons,
    nextPriority,
  });

  eventBus.publish('strategy_reviewed', { strategyId, reviewId: review.id });
  return review;
}
