// ============================================================
// ROOT-CAUSE GRAPH (spec §6, §7, §12)
//
// Given a set of skills a student is currently weak in, this finds
// which weak skill is the best upstream lever to pull — the one
// whose repair would plausibly help the most *other* weak skills —
// rather than always pointing at the skill that most recently
// produced a wrong answer.
// ============================================================

import { BottleneckCandidate, Skill, SkillId } from './types';

export interface WeakSkillInput {
  skillId: SkillId;
  masteryLevel: number; // 0–1, lower = weaker
}

/** For each skill, which skills directly list it as a prerequisite. */
function buildReverseDependencyMap(skills: Skill[]): Map<SkillId, SkillId[]> {
  const reverse = new Map<SkillId, SkillId[]>();
  for (const skill of skills) reverse.set(skill.id, []);
  for (const skill of skills) {
    for (const prereqId of skill.prerequisiteIds) {
      const list = reverse.get(prereqId);
      if (list) list.push(skill.id);
      else reverse.set(prereqId, [skill.id]);
    }
  }
  return reverse;
}

/** Every skill reachable downstream of `skillId`, any number of hops away. */
function getTransitiveDownstream(skillId: SkillId, reverseMap: Map<SkillId, SkillId[]>): SkillId[] {
  const seen = new Set<SkillId>();
  const queue = [...(reverseMap.get(skillId) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift() as SkillId;
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...(reverseMap.get(next) ?? []));
  }
  return [...seen];
}

/**
 * Spec §7's example: Probability, Ratio, and Percentage are all weak, and
 * Percentage sits under more of the student's other weak skills — so
 * Percentage should be the recommended repair target, not Probability.
 *
 * A skill with nothing depending on it can't be a root cause of anything
 * else in the current weak set — it's a symptom, not a lever — so its
 * bottleneck score is 0 even if it is itself severely weak.
 */
export function computeBottlenecks(weakSkills: WeakSkillInput[], skills: Skill[]): BottleneckCandidate[] {
  const reverseMap = buildReverseDependencyMap(skills);
  const weakIds = new Set(weakSkills.map((w) => w.skillId));

  const candidates: BottleneckCandidate[] = weakSkills.map((weak) => {
    const downstream = getTransitiveDownstream(weak.skillId, reverseMap).filter((id) => weakIds.has(id));
    const ownSeverity = clamp01(1 - weak.masteryLevel);
    const downstreamWeakCount = downstream.length;
    const bottleneckScore = downstreamWeakCount === 0 ? 0 : downstreamWeakCount * (1 + ownSeverity);
    return {
      skillId: weak.skillId,
      downstreamWeakCount,
      downstreamWeakSkillIds: downstream,
      ownSeverity,
      bottleneckScore,
    };
  });

  return candidates.sort((a, b) => b.bottleneckScore - a.bottleneckScore);
}

/** Direct prerequisites of `skillId` that are also weak — feeds the PREREQUISITE_GAP classifier. */
export function getWeakPrerequisites(
  skillId: SkillId,
  skills: Skill[],
  masteryBySkill: Map<SkillId, number>,
  weakThreshold = 0.6
): { skillId: SkillId; masteryLevel: number }[] {
  const skill = skills.find((s) => s.id === skillId);
  if (!skill) return [];
  return skill.prerequisiteIds
    .filter((prereqId) => masteryBySkill.has(prereqId))
    .map((prereqId) => ({ skillId: prereqId, masteryLevel: masteryBySkill.get(prereqId) as number }))
    .filter((p) => p.masteryLevel < weakThreshold);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
