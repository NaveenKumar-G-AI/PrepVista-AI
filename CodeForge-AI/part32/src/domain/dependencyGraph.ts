import { GapStatus, RoleSkillImportance, type DependencyAnnotation, type DependencyEdge } from "./types.js";

const DEPENDENT_WEIGHT: Record<RoleSkillImportance, number> = {
  [RoleSkillImportance.CORE]: 1,
  [RoleSkillImportance.IMPORTANT]: 0.6,
  [RoleSkillImportance.SUPPORTING]: 0.3,
  [RoleSkillImportance.OPTIONAL]: 0.1,
};

/**
 * Implements Phase 21 (Dependency Analysis) and Phase 22 (Root Gap
 * Detection).
 *
 * A skill is a "root gap" when: it currently has a gap, none of its own
 * prerequisites currently have a gap (i.e. it is the deepest unresolved
 * node in its chain, not a symptom of something further upstream), and at
 * least one downstream dependent also currently has a gap (i.e. it is
 * plausibly *causing* other gaps, not just an isolated leaf deficiency).
 *
 * This must be called with a PRELIMINARY gap-status map that was computed
 * without dependency information (see gapEngine.ts computeRoleGapProfile),
 * otherwise "does skill X have a gap" would depend on dependency analysis
 * which itself depends on that answer - a circular definition.
 */
export function analyzeDependencies(params: {
  skillId: string;
  dependencyEdges: DependencyEdge[];
  gapStatusBySkill: Map<string, GapStatus>;
  importanceBySkill: Map<string, RoleSkillImportance>;
}): DependencyAnnotation {
  const { skillId, dependencyEdges, gapStatusBySkill, importanceBySkill } = params;

  const prerequisites = dependencyEdges
    .filter((e) => e.skillId === skillId)
    .map((e) => e.prerequisiteSkillId);
  const dependents = dependencyEdges
    .filter((e) => e.prerequisiteSkillId === skillId)
    .map((e) => e.skillId);

  const hasGap = (id: string): boolean => {
    const status = gapStatusBySkill.get(id);
    return status !== undefined && status !== GapStatus.NO_GAP;
  };

  const blockedBy = prerequisites.filter(hasGap);
  const blocks = dependents.filter(hasGap);
  const selfHasGap = hasGap(skillId);

  const isRootGap = selfHasGap && blockedBy.length === 0 && blocks.length > 0;

  const dependentWeight = blocks.reduce((sum, id) => {
    const importance = importanceBySkill.get(id);
    return sum + (importance ? DEPENDENT_WEIGHT[importance] : 0.1);
  }, 0);

  // Normalize: ~3 CORE downstream impacts saturates the score at 1.
  const dependencyImpactScore = Math.max(0, Math.min(1, dependentWeight / 3));

  return { isRootGap, blockedBy, blocks, dependencyImpactScore };
}

/** Convenience helper for Phase 46-48 cohort views: given a full set of
 *  per-skill dependency annotations, return just the skills flagged as
 *  root gaps. */
export function filterRootGaps<T extends { dependency: DependencyAnnotation }>(results: T[]): T[] {
  return results.filter((r) => r.dependency.isRootGap);
}
