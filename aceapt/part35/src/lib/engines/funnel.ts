import { getStagesForStudent } from '../db/repository';
import { STAGE_LABELS, PATTERN_THRESHOLDS } from '../constants';
import { STAGE_ORDER } from '../types';
import type { FunnelResult, FunnelStagePoint, PatternStrength, StageKey } from '../types';

function strengthFromCount(n: number): PatternStrength | 'none' {
  if (n <= 0) return 'none';
  if (n <= PATTERN_THRESHOLDS.limited) return 'limited_evidence';
  if (n <= PATTERN_THRESHOLDS.emerging) return 'emerging_pattern';
  return 'repeated_pattern';
}

export interface StageKeyEntry {
  opportunityId: string;
  stageKey: StageKey;
}

// Pure, dependency-free funnel math (Section 33: deterministic logic for
// counts and conversion calculations) — takes plain data in, so it is
// directly unit-testable without touching the file store.
export function computeFunnelFromEntries(entries: StageKeyEntry[]): FunnelResult {
  const totalOpportunities = new Set(entries.map((e) => e.opportunityId)).size;

  const countsByStage = new Map<StageKey, number>();
  for (const key of STAGE_ORDER) {
    const opps = new Set(entries.filter((e) => e.stageKey === key).map((e) => e.opportunityId));
    countsByStage.set(key, opps.size);
  }

  const points: FunnelStagePoint[] = STAGE_ORDER.map((key, i) => {
    const count = countsByStage.get(key) ?? 0;
    const prevCount = i === 0 ? totalOpportunities : countsByStage.get(STAGE_ORDER[i - 1]) ?? 0;
    const conversionFromPrevious = prevCount > 0 ? count / prevCount : null;
    return {
      stageKey: key,
      label: STAGE_LABELS[key],
      count,
      conversionFromPrevious,
      sampleQuality: strengthFromCount(prevCount),
    };
  });

  let bottleneck: FunnelResult['bottleneck'] = null;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    // Need at least an "emerging" sample at the from-stage before a transition
    // is allowed to be called out as THE bottleneck (Section 12: do not
    // overinterpret tiny samples).
    if (from.count < PATTERN_THRESHOLDS.limited + 1) continue;
    const rate = from.count > 0 ? to.count / from.count : 0;
    if (!bottleneck || rate < bottleneck.conversionRate) {
      const fromStrength = strengthFromCount(from.count);
      bottleneck = {
        fromStage: from.stageKey,
        toStage: to.stageKey,
        dropCount: from.count - to.count,
        conversionRate: rate,
        confidence: (fromStrength === 'none' ? 'limited_evidence' : fromStrength) as PatternStrength,
      };
    }
  }

  return { totalOpportunities, stages: points, bottleneck };
}

export function computeFunnel(studentId: string): FunnelResult {
  const stageRows = getStagesForStudent(studentId);
  return computeFunnelFromEntries(stageRows.map((s) => ({ opportunityId: s.opportunityId, stageKey: s.stageKey })));
}
