import type { MasteryLevel, ReadinessBlocker, ReadinessStrength, RoleModel, SkillSignal } from './types';
import { MASTERY_ORDER, STRENGTH_MAX_COUNT } from './config';

function masteryRank(m: MasteryLevel): number {
  return MASTERY_ORDER.indexOf(m);
}

/**
 * Every blocker names a specific skill and a specific reason (Phase 19) —
 * never a generic "improve your technical skills". Only core/important
 * skills produce blockers; a gap in an optional skill isn't a readiness
 * blocker, it just won't show up as a strength either.
 */
export function deriveBlockers(roleModel: RoleModel, signals: Map<string, SkillSignal>): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];

  for (const req of roleModel.skills) {
    if (req.importance !== 'core' && req.importance !== 'important') continue;
    const signal = signals.get(req.skillId);
    const severity = req.importance === 'core' ? 'critical' : 'moderate';

    if (!signal || signal.status === 'unassessed') {
      blockers.push({
        skillId: req.skillId,
        skillName: req.skillName,
        type: 'insufficient_evidence',
        severity,
        message: `${req.skillName} has not been assessed yet — no verified evidence is available.`,
      });
      continue;
    }
    if (signal.status === 'insufficient_evidence') {
      blockers.push({
        skillId: req.skillId,
        skillName: req.skillName,
        type: 'insufficient_evidence',
        severity,
        message: `${req.skillName} has some evidence, but not enough verified attempts yet to confirm mastery.`,
      });
      continue;
    }
    if (masteryRank(signal.mastery) < masteryRank(req.minimumMastery)) {
      blockers.push({
        skillId: req.skillId,
        skillName: req.skillName,
        type: 'below_threshold',
        severity,
        message: `${req.skillName} is currently at "${signal.mastery}"; this role requires at least "${req.minimumMastery}".`,
      });
      continue;
    }
    if (signal.consistency === 'unstable') {
      blockers.push({
        skillId: req.skillId,
        skillName: req.skillName,
        type: 'inconsistent_performance',
        severity: 'moderate',
        message: `${req.skillName} meets the mastery bar on average, but recent performance has been inconsistent.`,
      });
    }
  }

  return blockers;
}

export function deriveStrengths(roleModel: RoleModel, signals: Map<string, SkillSignal>): ReadinessStrength[] {
  const candidates: Array<ReadinessStrength & { margin: number }> = [];

  for (const req of roleModel.skills) {
    if (req.importance === 'optional') continue;
    const signal = signals.get(req.skillId);
    if (!signal || signal.status !== 'assessed' || signal.masteryScoreEstimate === null) continue;
    if (masteryRank(signal.mastery) < masteryRank(req.minimumMastery)) continue;
    if (signal.consistency === 'unstable') continue; // inconsistent performance is never framed as a strength

    const margin = masteryRank(signal.mastery) - masteryRank(req.minimumMastery);
    candidates.push({
      skillId: req.skillId,
      skillName: req.skillName,
      mastery: signal.mastery,
      margin,
      message: `${req.skillName}: ${signal.mastery}${signal.trend === 'improving' ? ', improving' : ''}.`,
    });
  }

  return candidates
    .sort((a, b) => b.margin - a.margin)
    .slice(0, STRENGTH_MAX_COUNT)
    .map(({ margin, ...rest }) => {
      void margin;
      return rest;
    });
}
