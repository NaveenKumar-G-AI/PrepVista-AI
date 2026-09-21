import type { Skill, SkillPrerequisite } from '../domain/types';

export interface SkillGraph {
  skills: Map<string, Skill>;
  /** skillId -> prerequisite skillIds (PREREQUISITE relationship only) */
  prereqOf: Map<string, string[]>;
  /** skillId -> skillIds that list it as a prerequisite (reverse edges) */
  dependentsOf: Map<string, string[]>;
}

export function buildSkillGraph(skills: Skill[], edges: SkillPrerequisite[]): SkillGraph {
  const skillMap = new Map(skills.map((s) => [s.id, s]));
  const prereqOf = new Map<string, string[]>();
  const dependentsOf = new Map<string, string[]>();
  for (const s of skills) {
    prereqOf.set(s.id, []);
    dependentsOf.set(s.id, []);
  }
  for (const e of edges) {
    if (e.relationshipType !== 'PREREQUISITE') continue;
    if (!skillMap.has(e.skillId) || !skillMap.has(e.prerequisiteSkillId)) continue;
    prereqOf.get(e.skillId)!.push(e.prerequisiteSkillId);
    dependentsOf.get(e.prerequisiteSkillId)!.push(e.skillId);
  }
  return { skills: skillMap, prereqOf, dependentsOf };
}

export interface CycleCheckResult {
  hasCycle: boolean;
  cycle?: string[];
}

/**
 * Classic 3-color DFS cycle detection (Phase 59). Runs once at graph-build
 * time so the roadmap generator can refuse to traverse a corrupt graph
 * instead of infinite-looping.
 */
export function detectCycle(graph: SkillGraph): CycleCheckResult {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.skills.keys()) color.set(id, WHITE);
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    color.set(id, GRAY);
    stack.push(id);
    for (const prereq of graph.prereqOf.get(id) ?? []) {
      const c = color.get(prereq);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(prereq);
        return [...stack.slice(cycleStart), prereq];
      }
      if (c === WHITE) {
        const found = visit(prereq);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const id of graph.skills.keys()) {
    if (color.get(id) === WHITE) {
      const found = visit(id);
      if (found) return { hasCycle: true, cycle: found };
    }
  }
  return { hasCycle: false };
}

/**
 * Blocking power (Phase 8): how many downstream skills transitively depend
 * on this one. A skill that blocks many others earns higher priority even
 * if, in isolation, its own gap looks modest — "queue weakness blocks BFS,
 * graph traversal, and shortest-path foundations" is exactly this.
 */
export function computeBlockingPower(graph: SkillGraph): Map<string, number> {
  const result = new Map<string, number>();

  // Iterative traversal with a per-root `seen` set: correct and cycle-safe
  // regardless of whether detectCycle already ran, because `seen` guards
  // against revisiting any node — including a path that cycles back to the
  // root itself — so this can never loop forever even on a corrupt graph.
  for (const id of graph.skills.keys()) {
    const seen = new Set<string>();
    const stack = [...(graph.dependentsOf.get(id) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (next === id || seen.has(next)) continue;
      seen.add(next);
      for (const d of graph.dependentsOf.get(next) ?? []) {
        if (d !== id && !seen.has(d)) stack.push(d);
      }
    }
    result.set(id, seen.size);
  }

  return result;
}

/**
 * Given a target skill, walks its prerequisite chain and returns the
 * ordered list of prerequisite skill ids that must be scheduled before it
 * (deepest prerequisite first), guarding against cycles with a visited set.
 */
export function resolvePrerequisiteChain(graph: SkillGraph, skillId: string): string[] {
  const ordered: string[] = [];
  const visited = new Set<string>();

  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const prereq of graph.prereqOf.get(id) ?? []) {
      walk(prereq);
      if (!ordered.includes(prereq)) ordered.push(prereq);
    }
  }
  walk(skillId);
  return ordered;
}

/**
 * Longest-path-from-root layer index for each skill in `includedIds`,
 * restricted to prerequisite edges *within* the included set. Used to group
 * skills into milestones in dependency order (Phase 12).
 */
export function computeLayers(graph: SkillGraph, includedIds: Set<string>): Map<string, number> {
  const layer = new Map<string, number>();
  const visiting = new Set<string>();

  function layerOf(id: string): number {
    if (layer.has(id)) return layer.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const prereqsInSet = (graph.prereqOf.get(id) ?? []).filter((p) => includedIds.has(p));
    const l = prereqsInSet.length === 0 ? 0 : 1 + Math.max(...prereqsInSet.map(layerOf));
    visiting.delete(id);
    layer.set(id, l);
    return l;
  }

  for (const id of includedIds) layerOf(id);
  return layer;
}
