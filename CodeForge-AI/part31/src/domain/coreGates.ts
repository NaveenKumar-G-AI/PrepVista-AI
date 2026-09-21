import type { MasteryLevel, RoleModel, SkillSignal } from './types';
import { MASTERY_ORDER } from './config';

function masteryRank(m: MasteryLevel): number {
  return MASTERY_ORDER.indexOf(m);
}

export interface CoreGateFailure {
  skillId: string;
  reason: 'unassessed' | 'insufficient_evidence' | 'below_threshold';
}

export interface CoreGateResult {
  passed: boolean;
  failures: CoreGateFailure[];
}

/**
 * Phase 12, the non-negotiable rule: a core skill below its bar (or never
 * assessed) blocks readiness regardless of how high the weighted average
 * looks. `classification.ts` treats a failed gate as a hard cap, not a
 * penalty that can be averaged away by strong non-core skills.
 */
export function evaluateCoreGates(roleModel: RoleModel, signals: Map<string, SkillSignal>): CoreGateResult {
  const failures: CoreGateFailure[] = [];

  for (const req of roleModel.skills) {
    if (req.importance !== 'core') continue;

    const signal = signals.get(req.skillId);
    if (!signal || signal.status === 'unassessed') {
      failures.push({ skillId: req.skillId, reason: 'unassessed' });
      continue;
    }
    if (signal.status === 'insufficient_evidence') {
      failures.push({ skillId: req.skillId, reason: 'insufficient_evidence' });
      continue;
    }
    if (masteryRank(signal.mastery) < masteryRank(req.minimumMastery)) {
      failures.push({ skillId: req.skillId, reason: 'below_threshold' });
    }
  }

  return { passed: failures.length === 0, failures };
}
