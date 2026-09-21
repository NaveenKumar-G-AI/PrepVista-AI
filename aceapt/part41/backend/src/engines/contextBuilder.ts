import type { ContextSourceRepository, StrategyStore } from '../repositories/types.js';
import type { StrategyContext } from '../types/strategy.js';
import type { ID, PriorityWeights } from '../types/domain.js';

const LOOKBACK_DAYS = 90;

/**
 * PHASE 1 of the AI pipeline (spec #52): CONTEXT BUILDER.
 *
 * Pulls only the fields the strategy engines and (optionally) the LLM are
 * allowed to see, and normalizes them into one object. This is the allowlist
 * — nothing outside this function should reach into raw repositories/DB rows
 * on the engines' behalf. If you need a new field downstream, add it here
 * deliberately rather than passing a whole record through.
 */
export async function buildStrategyContext(
  studentId: ID,
  sources: ContextSourceRepository,
  store: StrategyStore,
  priorities: PriorityWeights = {},
): Promise<StrategyContext> {
  const [goal, skills, evidence, opportunities, applications, recentDecisions, recentOutcomes, constraints] =
    await Promise.all([
      sources.getGoal(studentId),
      sources.getSkills(studentId),
      sources.getEvidence(studentId),
      sources.getOpportunities(studentId),
      sources.getApplications(studentId),
      sources.getRecentDecisions(studentId, LOOKBACK_DAYS),
      sources.getRecentOutcomes(studentId, LOOKBACK_DAYS),
      sources.getConstraints(studentId),
    ]);

  const currentStrategy = await store.getOrCreateStrategy(studentId);
  const currentVersion = await store.getCurrentVersion(currentStrategy.id);
  const recentActions = await store.listActions(currentStrategy.id);

  return {
    studentId,
    goal,
    skills,
    evidence,
    opportunities,
    applications,
    recentDecisions,
    recentOutcomes,
    constraints,
    currentStrategy,
    currentVersion,
    recentActions,
    priorities: currentVersion?.priorities ?? priorities,
    asOf: new Date().toISOString(),
  };
}

/** spec #64-65: is there enough to say anything useful yet? */
export function assessDataSufficiency(ctx: StrategyContext): 'ok' | 'low_data' | 'empty' {
  if (!ctx.goal) return 'empty';
  const signalCount = ctx.evidence.length + ctx.applications.length + ctx.recentDecisions.length + ctx.recentOutcomes.length;
  if (signalCount === 0) return 'empty';
  if (signalCount < 3) return 'low_data';
  return 'ok';
}
