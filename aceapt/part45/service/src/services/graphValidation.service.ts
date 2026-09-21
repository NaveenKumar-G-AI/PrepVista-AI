import { DEPENDENCY_RELATIONSHIP_TYPES } from '../domain/enums';
import type { SkillEdge, SkillNode, ValidationIssue, ValidationReport } from '../domain/types';

const DEP_TYPES: Set<string> = new Set(DEPENDENCY_RELATIONSHIP_TYPES);

/**
 * Detects circular prerequisite chains (section 21: "A -> B -> C -> A").
 * Only dependency-style relationship types participate (PREREQUISITE,
 * DEPENDS_ON, BUILDS, PART_OF) — RELATED_TO/TRANSFER_TO/COMMON_ERROR_SOURCE
 * are associative and cannot form a meaningful cycle.
 */
export function detectCycles(nodes: SkillNode[], edges: SkillEdge[]): ValidationIssue[] {
  const depEdges = edges.filter((e) => DEP_TYPES.has(e.relationshipType));
  const adjacency = new Map<string, string[]>();
  for (const n of nodes) adjacency.set(n.id, []);
  for (const e of depEdges) {
    if (!adjacency.has(e.fromSkillId)) adjacency.set(e.fromSkillId, []);
    adjacency.get(e.fromSkillId)!.push(e.toSkillId);
  }

  const issues: ValidationIssue[] = [];
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const id of adjacency.keys()) color.set(id, WHITE);
  const stack: string[] = [];
  const reportedCycles = new Set<string>();

  function dfs(node: string) {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      if (color.get(next) === GRAY) {
        const cycleStart = stack.indexOf(next);
        const cyclePath = stack.slice(cycleStart).concat(next);
        const key = [...cyclePath].sort().join('|');
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          issues.push({
            severity: 'CRITICAL',
            type: 'CIRCULAR_PREREQUISITE',
            message: `Circular dependency detected: ${cyclePath.join(' -> ')}`,
            skillIds: cyclePath,
          });
        }
      } else if (color.get(next) === WHITE) {
        dfs(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const id of adjacency.keys()) {
    if (color.get(id) === WHITE) dfs(id);
  }
  return issues;
}

/**
 * A node cannot become its own ancestor (section 21). Walks each skill's
 * parent chain looking for a repeat.
 */
export function detectInvalidHierarchy(nodes: SkillNode[]): ValidationIssue[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const issues: ValidationIssue[] = [];
  const reported = new Set<string>();

  for (const node of nodes) {
    const seen = new Set<string>([node.id]);
    let current = node.parentId ? byId.get(node.parentId) : undefined;
    while (current) {
      if (seen.has(current.id)) {
        const key = [...seen].sort().join('|');
        if (!reported.has(key)) {
          reported.add(key);
          issues.push({
            severity: 'CRITICAL',
            type: 'INVALID_HIERARCHY_CYCLE',
            message: `Skill "${node.code}" has a circular parent chain through "${current.code}".`,
            skillIds: [...seen],
          });
        }
        break;
      }
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return issues;
}

/** References to a skill id that doesn't exist in the current node set (section 21). */
export function detectInvalidReferences(nodes: SkillNode[], edges: SkillEdge[]): ValidationIssue[] {
  const ids = new Set(nodes.map((n) => n.id));
  const issues: ValidationIssue[] = [];
  for (const e of edges) {
    if (!ids.has(e.fromSkillId) || !ids.has(e.toSkillId)) {
      issues.push({
        severity: 'CRITICAL',
        type: 'INVALID_RELATIONSHIP_REFERENCE',
        message: `Relationship ${e.id} references a skill id that does not exist in this graph version.`,
        relationshipId: e.id,
      });
    }
  }
  for (const n of nodes) {
    if (n.parentId && !ids.has(n.parentId)) {
      issues.push({
        severity: 'CRITICAL',
        type: 'INVALID_PARENT_REFERENCE',
        message: `Skill "${n.code}" has parentId "${n.parentId}", which does not exist in this graph version.`,
        skillIds: [n.id],
      });
    }
  }
  return issues;
}

/**
 * Two nodes plausibly representing the same concept (section 21). Heuristic
 * only — flagged as WARNING, not CRITICAL, since it needs a human to confirm.
 */
export function detectDuplicates(nodes: SkillNode[]): ValidationIssue[] {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const issues: ValidationIssue[] = [];
  const byDomain = new Map<string, SkillNode[]>();
  for (const n of nodes) {
    const key = `${n.domain}::${n.level}`;
    if (!byDomain.has(key)) byDomain.set(key, []);
    byDomain.get(key)!.push(n);
  }
  for (const group of byDomain.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.id === b.id) continue;
        const na = normalize(a.displayName);
        const nb = normalize(b.displayName);
        if (na === nb) {
          issues.push({
            severity: 'WARNING',
            type: 'POSSIBLE_DUPLICATE_SKILL',
            message: `"${a.code}" and "${b.code}" have the same normalized name ("${a.displayName}") in the same domain/level — verify these aren't duplicates.`,
            skillIds: [a.id, b.id],
          });
        }
      }
    }
  }
  return issues;
}

/**
 * SKILL/SUBSKILL-level nodes with zero relationships and no parent (section
 * 21: "important skills accidentally isolated"). DOMAIN/CATEGORY nodes are
 * expected to have no direct relationships of their own, so they're excluded.
 */
export function detectOrphans(nodes: SkillNode[], edges: SkillEdge[]): ValidationIssue[] {
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.fromSkillId);
    connected.add(e.toSkillId);
  }
  const issues: ValidationIssue[] = [];
  for (const n of nodes) {
    if (n.level === 'DOMAIN' || n.level === 'CATEGORY') continue;
    const hasParent = Boolean(n.parentId);
    const hasRelationship = connected.has(n.id);
    if (!hasParent && !hasRelationship) {
      issues.push({
        severity: 'WARNING',
        type: 'ORPHAN_SKILL',
        message: `Skill "${n.code}" has no parent and no relationships — it is disconnected from the rest of the curriculum.`,
        skillIds: [n.id],
      });
    }
  }
  return issues;
}

export function runFullValidation(nodes: SkillNode[], edges: SkillEdge[]): ValidationReport {
  const issues: ValidationIssue[] = [
    ...detectCycles(nodes, edges),
    ...detectInvalidHierarchy(nodes),
    ...detectInvalidReferences(nodes, edges),
    ...detectDuplicates(nodes),
    ...detectOrphans(nodes, edges),
  ];
  const criticalCount = issues.filter((i) => i.severity === 'CRITICAL').length;
  const warningCount = issues.length - criticalCount;
  return {
    isValid: criticalCount === 0,
    generatedAt: new Date().toISOString(),
    issueCount: issues.length,
    criticalCount,
    warningCount,
    issues,
  };
}
