import { skillRepository } from '../repositories/skill.repository';
import { relationshipRepository } from '../repositories/relationship.repository';
import type { SkillEdge, SkillNode } from '../domain/types';
import type { Skill, SkillRelationshipRow } from '../db/schema';

function toNode(row: Skill): SkillNode {
  return {
    id: row.id,
    code: row.code,
    displayName: row.displayName,
    domain: row.domain,
    level: row.level,
    parentId: row.parentId,
    status: row.status,
  };
}

function toEdge(row: SkillRelationshipRow): SkillEdge {
  return {
    id: row.id,
    fromSkillId: row.fromSkillId,
    toSkillId: row.toSkillId,
    relationshipType: row.relationshipType,
    weight: row.weight,
    confidence: row.confidence,
    source: row.source,
    status: row.status,
    rationale: row.rationale,
  };
}

export interface GraphSnapshot {
  nodes: SkillNode[];
  edges: SkillEdge[];
  nodesById: Map<string, SkillNode>;
  nodesByCode: Map<string, SkillNode>;
}

// Section 66: cache the stable global graph structure; invalidate on any
// admin mutation (create/update skill or relationship, publish, rollback).
// This is intentionally a simple time+version cache rather than a fully
// event-driven invalidation bus, appropriate for curriculum-scale data that
// changes rarely relative to how often it's read.
let cache: { snapshot: GraphSnapshot; cachedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export function invalidateGraphCache() {
  cache = null;
}

/**
 * Loads all skills/relationships with the given status (default PUBLISHED —
 * the graph students and most read APIs should see) as plain traversal-ready
 * objects. Admin/validation flows pass status=undefined to see the full
 * working set including DRAFT content.
 */
export async function loadGraphSnapshot(status: string | undefined = 'PUBLISHED'): Promise<GraphSnapshot> {
  if (status === 'PUBLISHED' && cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
    return cache.snapshot;
  }

  const skillRows = status ? await skillRepository.listByStatus(status) : await skillRepository.listAll();
  const relationshipRows = status ? await relationshipRepository.listByStatus(status) : await relationshipRepository.listAll();

  const nodes = skillRows.map(toNode);
  const edges = relationshipRows.map(toEdge);
  const snapshot: GraphSnapshot = {
    nodes,
    edges,
    nodesById: new Map(nodes.map((n) => [n.id, n])),
    nodesByCode: new Map(nodes.map((n) => [n.code, n])),
  };

  if (status === 'PUBLISHED') cache = { snapshot, cachedAt: Date.now() };
  return snapshot;
}
