import type { GapStatus, RoadmapDiff } from '../domain/types';
import type { DraftMilestone } from './roadmapGenerator';

const SEVERITY: Record<GapStatus, number> = {
  COMPLETE: 0,
  DEVELOPING: 1,
  INSUFFICIENT_EVIDENCE: 1.5,
  UNKNOWN: 2,
  BLOCKED: 2,
  GAP: 2.5,
  CRITICAL_GAP: 3,
};

export interface PrevSkillSnapshot {
  skillId: string;
  skillName: string;
  gapStatus: GapStatus;
}

/**
 * Decides whether the freshly-generated draft differs materially from the
 * roadmap's current version. Only a material difference should ever create
 * a new roadmap_version — otherwise every dashboard page load would spawn
 * a new version (explicitly forbidden by Phase 21).
 */
export function diffRoadmaps(
  prevSkills: PrevSkillSnapshot[],
  newMilestones: DraftMilestone[]
): { materialChange: boolean; diff: RoadmapDiff } {
  const prevMap = new Map(prevSkills.map((s) => [s.skillId, s]));
  const newSkills = newMilestones.flatMap((m) => m.skills);
  const newMap = new Map(newSkills.map((s) => [s.skillId, s]));

  const skillsInserted: RoadmapDiff['skillsInserted'] = [];
  const skillsCompleted: RoadmapDiff['skillsCompleted'] = [];
  const skillsRegressed: RoadmapDiff['skillsRegressed'] = [];

  for (const s of newSkills) {
    const prev = prevMap.get(s.skillId);
    if (!prev) {
      skillsInserted.push({ skillId: s.skillId, skillName: s.skillName, reason: s.insertedReason ?? 'New requirement identified.' });
      continue;
    }
    if (prev.gapStatus !== 'COMPLETE' && s.gapStatus === 'COMPLETE') {
      skillsCompleted.push({ skillId: s.skillId, skillName: s.skillName });
    } else if (SEVERITY[s.gapStatus] > SEVERITY[prev.gapStatus]) {
      skillsRegressed.push({ skillId: s.skillId, skillName: s.skillName, from: prev.gapStatus, to: s.gapStatus });
    }
  }

  // Skills present before but absent now (because they're done and dropped
  // out of the active set) still count as completions.
  for (const prev of prevSkills) {
    if (!newMap.has(prev.skillId) && prev.gapStatus !== 'COMPLETE') {
      skillsCompleted.push({ skillId: prev.skillId, skillName: prev.skillName });
    }
  }

  const materialChange =
    skillsInserted.length > 0 || skillsCompleted.length > 0 || skillsRegressed.length > 0 || prevSkills.length !== newSkills.length;

  const parts: string[] = [];
  if (skillsInserted.length) parts.push(`${skillsInserted.length} skill(s) newly inserted`);
  if (skillsCompleted.length) parts.push(`${skillsCompleted.length} skill(s) reached target`);
  if (skillsRegressed.length) parts.push(`${skillsRegressed.length} skill(s) regressed`);
  const summary = parts.length ? parts.join('; ') + '.' : 'No material change.';

  return { materialChange, diff: { skillsInserted, skillsCompleted, skillsRegressed, milestonesCompleted: [], summary } };
}

export interface PrevMilestoneSnapshot {
  id: string;
  status: string;
  skillIds: string[];
}

/**
 * Matches a new milestone to its closest predecessor by Jaccard overlap of
 * skill sets, so a milestone that's 4/5 the same skills is recognized as
 * "the same milestone, evolved" rather than reset to LOCKED — this is what
 * lets in-progress work survive a recalculation.
 */
export function matchMilestone(newSkillIds: string[], prevMilestones: PrevMilestoneSnapshot[]): PrevMilestoneSnapshot | null {
  let best: PrevMilestoneSnapshot | null = null;
  let bestScore = 0;
  const newSet = new Set(newSkillIds);
  for (const prev of prevMilestones) {
    const prevSet = new Set(prev.skillIds);
    const intersection = [...newSet].filter((id) => prevSet.has(id)).length;
    const union = new Set([...newSet, ...prevSet]).size;
    const score = union === 0 ? 0 : intersection / union;
    if (score > bestScore) {
      bestScore = score;
      best = prev;
    }
  }
  return bestScore >= 0.5 ? best : null;
}
