import { detectCycles, detectInvalidHierarchy, detectInvalidReferences, detectDuplicates, detectOrphans, runFullValidation } from '../../src/services/graphValidation.service';
import type { SkillEdge, SkillNode } from '../../src/domain/types';

function node(id: string, code: string, opts: Partial<SkillNode> = {}): SkillNode {
  return { id, code, displayName: code, domain: 'QUANTITATIVE_APTITUDE', level: 'SKILL', parentId: null, status: 'PUBLISHED', ...opts };
}
function edge(id: string, from: string, to: string, type: SkillEdge['relationshipType'] = 'PREREQUISITE'): SkillEdge {
  return { id, fromSkillId: from, toSkillId: to, relationshipType: type, weight: 1, confidence: 'MODERATE', source: 'CURRICULUM', status: 'PUBLISHED' };
}

describe('graphValidation.service — detectCycles', () => {
  test('flags a direct A -> B -> C -> A cycle as CRITICAL', () => {
    const nodes = [node('A', 'A'), node('B', 'B'), node('C', 'C')];
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'C'), edge('e3', 'C', 'A')];
    const issues = detectCycles(nodes, edges);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('CRITICAL');
    expect(issues[0].type).toBe('CIRCULAR_PREREQUISITE');
  });

  test('a clean DAG produces no cycle issues', () => {
    const nodes = [node('A', 'A'), node('B', 'B'), node('C', 'C')];
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')];
    expect(detectCycles(nodes, edges)).toEqual([]);
  });

  test('RELATED_TO edges cannot form a flagged cycle (associative, not ordering)', () => {
    const nodes = [node('A', 'A'), node('B', 'B')];
    const edges = [edge('e1', 'A', 'B', 'RELATED_TO'), edge('e2', 'B', 'A', 'RELATED_TO')];
    expect(detectCycles(nodes, edges)).toEqual([]);
  });
});

describe('graphValidation.service — detectInvalidHierarchy', () => {
  test('flags a skill that is its own ancestor', () => {
    const nodes = [node('A', 'A', { parentId: 'B' }), node('B', 'B', { parentId: 'A' })];
    const issues = detectInvalidHierarchy(nodes);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('INVALID_HIERARCHY_CYCLE');
  });

  test('a normal parent chain is valid', () => {
    const nodes = [node('A', 'A', { parentId: null }), node('B', 'B', { parentId: 'A' }), node('C', 'C', { parentId: 'B' })];
    expect(detectInvalidHierarchy(nodes)).toEqual([]);
  });
});

describe('graphValidation.service — detectInvalidReferences', () => {
  test('flags a relationship pointing at a nonexistent skill', () => {
    const nodes = [node('A', 'A')];
    const edges = [edge('e1', 'A', 'GHOST')];
    const issues = detectInvalidReferences(nodes, edges);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('INVALID_RELATIONSHIP_REFERENCE');
  });

  test('flags a skill whose parentId does not exist', () => {
    const nodes = [node('A', 'A', { parentId: 'GHOST' })];
    const issues = detectInvalidReferences(nodes, []);
    expect(issues.some((i) => i.type === 'INVALID_PARENT_REFERENCE')).toBe(true);
  });
});

describe('graphValidation.service — detectDuplicates', () => {
  test('flags two skills with the same normalized name in the same domain/level', () => {
    const nodes = [node('A', 'QUANT.PCT', { displayName: 'Percentages' }), node('B', 'QUANT.PERCENT', { displayName: 'percentages' })];
    const issues = detectDuplicates(nodes);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('WARNING');
  });

  test('same name in a DIFFERENT domain is not flagged', () => {
    const nodes = [node('A', 'A', { displayName: 'Series', domain: 'QUANTITATIVE_APTITUDE' }), node('B', 'B', { displayName: 'Series', domain: 'LOGICAL_REASONING' })];
    expect(detectDuplicates(nodes)).toEqual([]);
  });
});

describe('graphValidation.service — detectOrphans', () => {
  test('flags a SKILL-level node with no parent and no relationships', () => {
    const nodes = [node('A', 'A', { level: 'SKILL', parentId: null })];
    const issues = detectOrphans(nodes, []);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('WARNING');
  });

  test('does not flag a skill that has a parent even with no relationships', () => {
    const nodes = [node('CAT', 'CAT', { level: 'CATEGORY' }), node('A', 'A', { level: 'SKILL', parentId: 'CAT' })];
    expect(detectOrphans(nodes, [])).toEqual([]);
  });

  test('CATEGORY/DOMAIN nodes are never flagged as orphans', () => {
    const nodes = [node('CAT', 'CAT', { level: 'CATEGORY', parentId: null })];
    expect(detectOrphans(nodes, [])).toEqual([]);
  });
});

describe('graphValidation.service — runFullValidation', () => {
  test('a clean graph is valid with zero issues', () => {
    const nodes = [node('CAT', 'CAT', { level: 'CATEGORY' }), node('A', 'A', { level: 'SKILL', parentId: 'CAT' }), node('B', 'B', { level: 'SKILL', parentId: 'CAT' })];
    const edges = [edge('e1', 'A', 'B')];
    const report = runFullValidation(nodes, edges);
    expect(report.isValid).toBe(true);
    expect(report.criticalCount).toBe(0);
  });

  test('publishing must fail (isValid=false) when a critical issue exists', () => {
    const nodes = [node('A', 'A', { level: 'SKILL' }), node('B', 'B', { level: 'SKILL' })];
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'A')];
    const report = runFullValidation(nodes, edges);
    expect(report.isValid).toBe(false);
    expect(report.criticalCount).toBeGreaterThan(0);
  });
});
