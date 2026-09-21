import { AlignmentResult, StrategyTier, TargetPriorityEntry } from '../domain/types';

/**
 * Turns a student's full set of AlignmentResults into a short, tiered list
 * (spec §22, §31) instead of dumping every configured target on them.
 * Ranking is primarily evidence-driven (fit, then readiness); preference
 * and time-budget are deliberately small nudges on top, never overrides —
 * spec §23 forbids unsupported job-market claims or revenue-optimized
 * ordering, so this stays anchored to the same fit/readiness numbers shown
 * everywhere else.
 */

export interface ShortlistOptions {
  preferredTargetIds?: string[];
  availableWeeks?: number;
}

const MAX_SHORTLIST_LENGTH = 6;
const PREFERENCE_NUDGE = 3;
const OVER_BUDGET_PENALTY = 5;

function tierForRank(rank: number): StrategyTier {
  if (rank === 1) return 'PRIMARY';
  if (rank === 2) return 'SECONDARY';
  return 'STRETCH';
}

function reasonFor(result: AlignmentResult, overBudget: boolean, preferred: boolean): string {
  const parts: string[] = [];
  if (result.fitScore !== null) {
    parts.push(`Fit ${result.fitScore}%`);
  }
  if (result.criticalGaps.length > 0) {
    parts.push(`blocked by ${result.criticalGaps[0]!.capabilityName}`);
  } else if (result.strengths.length > 0) {
    parts.push(`led by ${result.strengths[0]!.capabilityName}`);
  }
  if (overBudget && result.state !== 'LOW_ALIGNMENT') {
    parts.push('typically needs more time than you have available');
  }
  if (preferred) {
    parts.push('one of your selected preferences');
  }
  return parts.join(' \u2014 ') || 'Not enough evidence yet to characterize this target';
}

export function buildTargetPriorityShortlist(
  results: AlignmentResult[],
  targetPrepWeeks: Record<string, number | undefined> = {},
  options: ShortlistOptions = {},
): { shortlist: TargetPriorityEntry[]; awaitingEvidence: { targetId: string; targetName: string }[] } {
  const preferredSet = new Set(options.preferredTargetIds ?? []);

  const scored = results.filter((r) => r.fitScore !== null);
  const awaitingEvidence = results
    .filter((r) => r.fitScore === null)
    .map((r) => ({ targetId: r.targetId, targetName: r.targetName }));

  const withNudge = scored.map((r) => {
    const prepWeeks = targetPrepWeeks[r.targetId];
    const overBudget =
      options.availableWeeks !== undefined && prepWeeks !== undefined && prepWeeks > options.availableWeeks;
    const preferred = preferredSet.has(r.targetId);
    const nudge = (preferred ? PREFERENCE_NUDGE : 0) - (overBudget ? OVER_BUDGET_PENALTY : 0);
    return { result: r, overBudget, preferred, rankScore: (r.fitScore ?? 0) + nudge };
  });

  withNudge.sort(
    (a, b) => b.rankScore - a.rankScore || (b.result.readinessScore ?? 0) - (a.result.readinessScore ?? 0),
  );

  const shortlist: TargetPriorityEntry[] = withNudge.slice(0, MAX_SHORTLIST_LENGTH).map((entry, i) => {
    const rank = i + 1;
    return {
      targetId: entry.result.targetId,
      targetName: entry.result.targetName,
      rank,
      tier: tierForRank(rank),
      fitScore: entry.result.fitScore,
      readinessScore: entry.result.readinessScore,
      state: entry.result.state,
      reason: reasonFor(entry.result, entry.overBudget, entry.preferred),
    };
  });

  return { shortlist, awaitingEvidence };
}
