import type { ClaimNode, ClaimRelationship, RelationshipType } from "../types";

export interface ClaimGraph {
  claims: ClaimNode[];
  relationships: ClaimRelationship[];
}

export function buildClaimGraph(claims: ClaimNode[], relationships: ClaimRelationship[]): ClaimGraph {
  return { claims, relationships };
}

/**
 * When a claim is contradicted, propagate that outward through the reasoning
 * chain so downstream findings can note "this may also be affected" instead
 * of treating every sentence independently (per spec: "If Claim B cannot
 * support Claim A, downstream reasoning may also be affected").
 *
 * Simplification, stated plainly: SUPPORTS/DEPENDS_ON/IMPLIES/CAUSES/
 * IMPLEMENTS/REQUIRES are treated as symmetric "reliance" links for this
 * propagation (BFS in both directions) rather than modeling strict
 * directional logical entailment. This favors flagging a possibly-affected
 * claim over silently missing one — refine to directional propagation once
 * real claim data shows it's needed.
 */
export function propagateContradictions(graph: ClaimGraph): Map<string, { affected: boolean; reason: string }> {
  const affected = new Map<string, { affected: boolean; reason: string }>();
  const contradictedPairs = graph.relationships.filter((r) => r.type === "CONTRADICTS");
  const contradicted = new Set(contradictedPairs.flatMap((r) => [r.fromClaimId, r.toClaimId]));

  const relianceTypes = new Set<RelationshipType>(["SUPPORTS", "DEPENDS_ON", "IMPLIES", "CAUSES", "IMPLEMENTS", "REQUIRES"]);
  const adjacency = new Map<string, string[]>();
  for (const r of graph.relationships) {
    if (!relianceTypes.has(r.type)) continue;
    if (!adjacency.has(r.fromClaimId)) adjacency.set(r.fromClaimId, []);
    if (!adjacency.has(r.toClaimId)) adjacency.set(r.toClaimId, []);
    adjacency.get(r.fromClaimId)!.push(r.toClaimId);
    adjacency.get(r.toClaimId)!.push(r.fromClaimId);
  }

  const queue: string[] = [...contradicted];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    affected.set(id, {
      affected: true,
      reason: contradicted.has(id) ? "directly contradicted" : "connected to a contradicted claim through the reasoning chain",
    });
    for (const neighbor of adjacency.get(id) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return affected;
}
