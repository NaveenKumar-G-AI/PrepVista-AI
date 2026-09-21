import { getPrerequisites, getDependents, getRelatedSkills, getUpstreamSkills, getDownstreamSkills, getSkillPath } from '../../src/services/graphTraversal.service';
import type { SkillEdge } from '../../src/domain/types';

// Fixture: A -> B -> C -> D (PREREQUISITE chain), plus E RELATED_TO B, and an
// unconnected node F.
function edge(id: string, from: string, to: string, type: SkillEdge['relationshipType'] = 'PREREQUISITE'): SkillEdge {
  return { id, fromSkillId: from, toSkillId: to, relationshipType: type, weight: 1, confidence: 'MODERATE', source: 'CURRICULUM', status: 'PUBLISHED' };
}

const edges: SkillEdge[] = [edge('e1', 'A', 'B'), edge('e2', 'B', 'C'), edge('e3', 'C', 'D'), edge('e4', 'E', 'B', 'RELATED_TO')];

describe('graphTraversal.service', () => {
  test('getPrerequisites returns direct upstream edges only', () => {
    const result = getPrerequisites('C', edges);
    expect(result.map((e) => e.fromSkillId)).toEqual(['B']);
  });

  test('getPrerequisites returns empty array for a root skill', () => {
    expect(getPrerequisites('A', edges)).toEqual([]);
  });

  test('getDependents returns direct downstream edges only', () => {
    const result = getDependents('B', edges);
    expect(result.map((e) => e.toSkillId)).toEqual(['C']);
  });

  test('getRelatedSkills finds RELATED_TO edges in either direction, excludes PREREQUISITE', () => {
    const result = getRelatedSkills('B', edges);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e4');
  });

  test('getUpstreamSkills walks the full prerequisite chain with correct hop distances', () => {
    const upstream = getUpstreamSkills('D', edges);
    expect(upstream.get('C')).toBe(1);
    expect(upstream.get('B')).toBe(2);
    expect(upstream.get('A')).toBe(3);
    expect(upstream.has('E')).toBe(false); // RELATED_TO, not a prerequisite
  });

  test('getUpstreamSkills respects maxDepth', () => {
    const upstream = getUpstreamSkills('D', edges, 1);
    expect([...upstream.keys()]).toEqual(['C']);
  });

  test('getDownstreamSkills walks the full dependent chain', () => {
    const downstream = getDownstreamSkills('A', edges);
    expect(downstream.get('B')).toBe(1);
    expect(downstream.get('C')).toBe(2);
    expect(downstream.get('D')).toBe(3);
  });

  test('getSkillPath finds the shortest path across relationship types', () => {
    const path = getSkillPath('A', 'D', edges);
    expect(path).toEqual(['A', 'B', 'C', 'D']);
  });

  test('getSkillPath returns null when no path exists', () => {
    expect(getSkillPath('A', 'F', edges)).toBeNull();
  });

  test('getSkillPath of a skill to itself is a single-element path', () => {
    expect(getSkillPath('A', 'A', edges)).toEqual(['A']);
  });

  test('a skill with no relationships returns empty results everywhere, not an error', () => {
    expect(getPrerequisites('F', edges)).toEqual([]);
    expect(getDependents('F', edges)).toEqual([]);
    expect(getUpstreamSkills('F', edges).size).toBe(0);
  });
});
