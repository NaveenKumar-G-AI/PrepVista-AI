/**
 * Sections 18-20: reasoning that needs the *whole* skill graph, not just one
 * skill's evidence — root cause, bottleneck detection, and a simplified
 * multi-skill composition check. Section 20 explicitly calls composition
 * detection an "advanced future capability" the prototype may simplify, so
 * computeCompositionGap() is intentionally a single, coarse rule rather
 * than the fuller interaction-effect analysis a production version would
 * need.
 */

import { THRESHOLDS } from '../domain/constants';
import { Skill, SkillEvidence } from '../domain/types';

/**
 * Section 18. If a skill's own performance is weak, walk its declared
 * prerequisites and flag any that are themselves weak (not just
 * under-evidenced — under-evidenced prerequisites aren't proven root
 * causes, so they're excluded here on purpose).
 */
export function computeRootCause(skillId: string, skills: Skill[], evidenceById: Map<string, SkillEvidence>): string[] {
  const skill = skills.find((s) => s.id === skillId);
  if (!skill || skill.prerequisiteIds.length === 0) return [];

  const weak: string[] = [];
  for (const prereqId of skill.prerequisiteIds) {
    const ev = evidenceById.get(prereqId);
    if (!ev) continue;
    const hasEnoughData = ev.independentDistinctQuestions >= THRESHOLDS.MIN_INDEPENDENT_DISTINCT_QUESTIONS;
    const isWeak = ev.independentAccuracy != null && ev.independentAccuracy < THRESHOLDS.ROOT_CAUSE_ACCURACY_FLOOR;
    if (hasEnoughData && isWeak) weak.push(prereqId);
  }
  return weak;
}

function dependsOn(skill: Skill, targetId: string, allSkills: Skill[], visited: Set<string> = new Set()): boolean {
  if (visited.has(skill.id)) return false;
  visited.add(skill.id);
  for (const prereqId of skill.prerequisiteIds) {
    if (prereqId === targetId) return true;
    const prereqSkill = allSkills.find((s) => s.id === prereqId);
    if (prereqSkill && dependsOn(prereqSkill, targetId, allSkills, visited)) return true;
  }
  return false;
}

export interface BottleneckInfo {
  skillId: string;
  dependentCount: number;
  isCurrentlyWeak: boolean;
}

/** Section 19: which skills block the most downstream skills right now. */
export function computeBottlenecks(skills: Skill[], evidenceById: Map<string, SkillEvidence>): BottleneckInfo[] {
  const results: BottleneckInfo[] = [];
  for (const skill of skills) {
    const dependentCount = skills.filter((other) => other.id !== skill.id && dependsOn(other, skill.id, skills)).length;
    if (dependentCount === 0) continue;
    const ev = evidenceById.get(skill.id);
    const isCurrentlyWeak = !!ev && ev.independentAccuracy != null && ev.independentAccuracy < THRESHOLDS.ROOT_CAUSE_ACCURACY_FLOOR;
    results.push({ skillId: skill.id, dependentCount, isCurrentlyWeak });
  }
  return results.sort((a, b) => b.dependentCount - a.dependentCount);
}

/**
 * Section 20 (simplified, as the spec explicitly allows for a prototype):
 * flags a composite skill as a COMPOSITION_GAP candidate only when every
 * component skill is independently solid but the composite itself is not
 * — i.e. the parts are mastered individually but combining them is the
 * actual sticking point.
 */
export function computeCompositionGap(skill: Skill, evidenceById: Map<string, SkillEvidence>): boolean {
  if (!skill.compositeOf || skill.compositeOf.length < 2) return false;
  const own = evidenceById.get(skill.id);
  if (!own || own.independentAccuracy == null || own.independentDistinctQuestions < 2) return false;

  const componentsSolid = skill.compositeOf.every((id) => {
    const ev = evidenceById.get(id);
    return ev && ev.independentAccuracy != null && ev.independentAccuracy >= THRESHOLDS.INDEPENDENT_MASTERY_ACCURACY;
  });

  return componentsSolid && own.independentAccuracy < THRESHOLDS.INDEPENDENT_MASTERY_ACCURACY - THRESHOLDS.DIFFICULTY_GAP_PP;
}
