// Circular-dependency protection for the skill prerequisite graph.
//
// An edge is stored as (skillId, prerequisiteSkillId), meaning
// "prerequisiteSkillId must be learned before skillId" — i.e. a directed
// edge prerequisiteSkillId -> skillId in an "enables" graph.
//
// Two complementary checks are provided:
//   - wouldCreateCycle: an O(V+E) reachability check used at write time,
//     before a single new edge is inserted.
//   - findCycles: a whole-graph topological sort (Kahn's algorithm) used
//     by scripts/validate.ts to audit the entire seeded graph at once.

export interface PrerequisiteEdge {
  skillId: string;
  prerequisiteSkillId: string;
}

function buildAdjacency(edges: PrerequisiteEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.prerequisiteSkillId) ?? [];
    list.push(edge.skillId);
    adjacency.set(edge.prerequisiteSkillId, list);
  }
  return adjacency;
}

function hasPath(adjacency: Map<string, string[]>, start: string, target: string): boolean {
  if (start === target) return true;
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    for (const next of adjacency.get(node) ?? []) {
      if (next === target) return true;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * Would inserting edge (skillId, prerequisiteSkillId) into the existing
 * graph `existingEdges` create a cycle?
 *
 * A self-reference is always a cycle. Otherwise: adding
 * prerequisiteSkillId -> skillId creates a cycle iff skillId can already
 * reach prerequisiteSkillId via existing edges (that reverse path, plus
 * the new edge, closes the loop).
 */
export function wouldCreateCycle(
  existingEdges: PrerequisiteEdge[],
  candidate: PrerequisiteEdge,
): boolean {
  if (candidate.skillId === candidate.prerequisiteSkillId) return true;
  const adjacency = buildAdjacency(existingEdges);
  return hasPath(adjacency, candidate.skillId, candidate.prerequisiteSkillId);
}

export interface CycleReport {
  hasCycle: boolean;
  /** Nodes that could not be placed in a valid topological order. */
  nodesInCycles: string[];
}

/**
 * Whole-graph audit via Kahn's algorithm: repeatedly remove nodes with
 * in-degree 0. Anything left over after the queue drains is part of a
 * cycle. Independent of wouldCreateCycle so a bug in one is unlikely to
 * be masked by the other.
 */
export function findCycles(edges: PrerequisiteEdge[]): CycleReport {
  const nodes = new Set<string>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    nodes.add(edge.skillId);
    nodes.add(edge.prerequisiteSkillId);
  }
  for (const node of nodes) inDegree.set(node, 0);
  for (const edge of edges) {
    const list = adjacency.get(edge.prerequisiteSkillId) ?? [];
    list.push(edge.skillId);
    adjacency.set(edge.prerequisiteSkillId, list);
    inDegree.set(edge.skillId, (inDegree.get(edge.skillId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [node, degree] of inDegree) if (degree === 0) queue.push(node);

  let visitedCount = 0;
  const remaining = new Map(inDegree);
  while (queue.length > 0) {
    const node = queue.shift() as string;
    visitedCount += 1;
    for (const next of adjacency.get(node) ?? []) {
      const updated = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, updated);
      if (updated === 0) queue.push(next);
    }
  }

  const nodesInCycles = [...remaining.entries()]
    .filter(([, degree]) => degree > 0)
    .map(([node]) => node);

  return { hasCycle: visitedCount !== nodes.size, nodesInCycles };
}
