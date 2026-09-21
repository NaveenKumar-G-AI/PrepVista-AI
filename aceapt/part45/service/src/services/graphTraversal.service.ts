import type { SkillEdge } from '../domain/types';

const PREREQ_TYPES = new Set(['PREREQUISITE', 'DEPENDS_ON']);
const ASSOCIATIVE_TYPES = new Set(['RELATED_TO', 'TRANSFER_TO']);

export interface Adjacency {
  /** fromSkillId -> outgoing edges */
  forward: Map<string, SkillEdge[]>;
  /** toSkillId -> incoming edges */
  backward: Map<string, SkillEdge[]>;
}

export function buildAdjacency(edges: SkillEdge[]): Adjacency {
  const forward = new Map<string, SkillEdge[]>();
  const backward = new Map<string, SkillEdge[]>();
  for (const e of edges) {
    if (!forward.has(e.fromSkillId)) forward.set(e.fromSkillId, []);
    forward.get(e.fromSkillId)!.push(e);
    if (!backward.has(e.toSkillId)) backward.set(e.toSkillId, []);
    backward.get(e.toSkillId)!.push(e);
  }
  return { forward, backward };
}

/** Skills that directly support `skillId` (edges pointing INTO it, PREREQUISITE/DEPENDS_ON only). */
export function getPrerequisites(skillId: string, edges: SkillEdge[]): SkillEdge[] {
  return edges.filter((e) => e.toSkillId === skillId && PREREQ_TYPES.has(e.relationshipType));
}

/** Skills that `skillId` directly supports (edges pointing OUT of it, PREREQUISITE/DEPENDS_ON only). */
export function getDependents(skillId: string, edges: SkillEdge[]): SkillEdge[] {
  return edges.filter((e) => e.fromSkillId === skillId && PREREQ_TYPES.has(e.relationshipType));
}

/** Associative (non-hierarchical) neighbors: RELATED_TO / TRANSFER_TO in either direction. */
export function getRelatedSkills(skillId: string, edges: SkillEdge[]): SkillEdge[] {
  return edges.filter((e) => (e.fromSkillId === skillId || e.toSkillId === skillId) && ASSOCIATIVE_TYPES.has(e.relationshipType));
}

/**
 * All skills upstream of `skillId` (its prerequisite chain), breadth-first,
 * mapped to hop distance. Depth-limited so a pathological graph can't cause
 * an unbounded walk (section 63).
 */
export function getUpstreamSkills(skillId: string, edges: SkillEdge[], maxDepth = 5): Map<string, number> {
  const depths = new Map<string, number>();
  const visited = new Set([skillId]);
  let frontier = [skillId];
  let depth = 0;
  while (frontier.length && depth < maxDepth) {
    depth++;
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of getPrerequisites(id, edges)) {
        if (!visited.has(edge.fromSkillId)) {
          visited.add(edge.fromSkillId);
          depths.set(edge.fromSkillId, depth);
          next.push(edge.fromSkillId);
        }
      }
    }
    frontier = next;
  }
  return depths;
}

/** All skills downstream of `skillId` (skills it supports), breadth-first, mapped to hop distance. */
export function getDownstreamSkills(skillId: string, edges: SkillEdge[], maxDepth = 5): Map<string, number> {
  const depths = new Map<string, number>();
  const visited = new Set([skillId]);
  let frontier = [skillId];
  let depth = 0;
  while (frontier.length && depth < maxDepth) {
    depth++;
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of getDependents(id, edges)) {
        if (!visited.has(edge.toSkillId)) {
          visited.add(edge.toSkillId);
          depths.set(edge.toSkillId, depth);
          next.push(edge.toSkillId);
        }
      }
    }
    frontier = next;
  }
  return depths;
}

/** Shortest path between two skills over ALL relationship types (undirected) — for "how are these connected". */
export function getSkillPath(fromSkillId: string, toSkillId: string, edges: SkillEdge[], maxDepth = 8): string[] | null {
  if (fromSkillId === toSkillId) return [fromSkillId];
  const { forward, backward } = buildAdjacency(edges);
  const queue: string[][] = [[fromSkillId]];
  const visited = new Set([fromSkillId]);

  while (queue.length) {
    const path = queue.shift()!;
    if (path.length - 1 >= maxDepth) continue;
    const node = path[path.length - 1];
    const neighbors = [...(forward.get(node) ?? []).map((e) => e.toSkillId), ...(backward.get(node) ?? []).map((e) => e.fromSkillId)];
    for (const n of neighbors) {
      if (n === toSkillId) return [...path, n];
      if (!visited.has(n)) {
        visited.add(n);
        queue.push([...path, n]);
      }
    }
  }
  return null;
}

export interface WeakPrerequisiteCandidate {
  skillId: string;
  hopDistance: number;
}

/** Upstream skills of `skillId`, without any evidence attached — the caller (a higher-level service) joins these against student state. */
export function getPrerequisiteCandidates(skillId: string, edges: SkillEdge[], maxDepth = 3): WeakPrerequisiteCandidate[] {
  const depths = getUpstreamSkills(skillId, edges, maxDepth);
  return [...depths.entries()].map(([skillId, hopDistance]) => ({ skillId, hopDistance }));
}
