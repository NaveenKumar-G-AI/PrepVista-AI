import { AlignmentGap, GapPriority, ImportanceTier } from '../domain/types';

/**
 * Ranks gaps into one Next Best Action (spec §26-27).
 *
 * Priority = (importance weight, boosted if the gap is critical) x
 * (current deficit). This is a ranking signal, not a promise of how many
 * fit points closing the gap is worth — spec §27 explicitly forbids
 * inventing improvement estimates without sufficient data. A concrete
 * "if you improve this, fit moves from X% to Y%" number only ever comes
 * from whatIfSimulator.ts, which recomputes the real engine rather than
 * guessing.
 */

const IMPORTANCE_WEIGHT: Record<ImportanceTier, number> = {
  CORE: 1.0,
  IMPORTANT: 0.6,
  SUPPORTING: 0.3,
};

const CRITICAL_BOOST = 0.5;

function priorityScore(gap: AlignmentGap): number {
  const weight = IMPORTANCE_WEIGHT[gap.importance] + (gap.isCritical ? CRITICAL_BOOST : 0);
  return weight * gap.deficit;
}

function rationaleFor(gap: AlignmentGap): string[] {
  const rationale: string[] = [];
  if (gap.isCritical) {
    rationale.push('Critical requirement for this target — currently capping your overall fit');
  } else {
    rationale.push(`${gap.importance.charAt(0)}${gap.importance.slice(1).toLowerCase()} requirement for this target`);
  }
  rationale.push(`Currently ${gap.currentLevel.toLowerCase().replace('_', ' ')}, target expects ${gap.requiredLevel.toLowerCase().replace('_', ' ')}`);
  if (gap.confidence === 'LOW') {
    rationale.push('Evidence for this capability is still thin — more attempts will sharpen this reading');
  }
  return rationale;
}

export function prioritizeNextBestAction(
  criticalGaps: AlignmentGap[],
  supportingGaps: AlignmentGap[],
): GapPriority | null {
  const allGaps = [...criticalGaps, ...supportingGaps];
  if (allGaps.length === 0) return null;

  const ranked = [...allGaps].sort((a, b) => priorityScore(b) - priorityScore(a));
  const top = ranked[0];
  if (!top) return null;

  return {
    capabilityId: top.capabilityId,
    capabilityName: top.capabilityName,
    priorityScore: Math.round(priorityScore(top) * 100) / 100,
    rationale: rationaleFor(top),
  };
}
