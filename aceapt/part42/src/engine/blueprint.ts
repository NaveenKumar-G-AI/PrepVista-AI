import type { Blueprint, BlueprintNode } from "../types/domain.js";

export function nodeById(blueprint: Blueprint, nodeId: string): BlueprintNode | undefined {
  return blueprint.nodes.find((n) => n.id === nodeId);
}

/** Returns [skill, subtopic, topic, domain] — the node itself first, root last. */
export function ancestorChain(blueprint: Blueprint, nodeId: string): BlueprintNode[] {
  const chain: BlueprintNode[] = [];
  let current = nodeById(blueprint, nodeId);
  while (current) {
    chain.push(current);
    current = current.parentNodeId ? nodeById(blueprint, current.parentNodeId) : undefined;
  }
  return chain;
}

export function children(blueprint: Blueprint, nodeId: string | null): BlueprintNode[] {
  return blueprint.nodes.filter((n) => n.parentNodeId === nodeId);
}

export function descendantSkills(blueprint: Blueprint, nodeId: string): BlueprintNode[] {
  const node = nodeById(blueprint, nodeId);
  if (!node) return [];
  if (node.level === "skill") return [node];
  const kids = children(blueprint, nodeId);
  return kids.flatMap((k) => descendantSkills(blueprint, k.id));
}

export function nodesAtLevel(blueprint: Blueprint, level: BlueprintNode["level"]): BlueprintNode[] {
  return blueprint.nodes.filter((n) => n.level === level);
}

/**
 * Module 5/12 — coverage requirement per node: how much evidence the
 * blueprint author asked for at that node, used by the stopping rule.
 * A node's requirement is satisfied once every leaf skill beneath it has
 * at least minEvidenceCount independent (weight-bearing) responses.
 */
export function isNodeCovered(
  blueprint: Blueprint,
  nodeId: string,
  evidenceCountBySkill: Map<string, number>,
): boolean {
  const leaves = descendantSkills(blueprint, nodeId);
  if (leaves.length === 0) return false;
  return leaves.every((leaf) => (evidenceCountBySkill.get(leaf.id) ?? 0) >= leaf.minEvidenceCount);
}
