import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillGraph, computeBlockingPower, computeLayers, detectCycle, resolvePrerequisiteChain } from '../src/engine/prerequisiteGraph';
import type { Skill, SkillPrerequisite } from '../src/domain/types';

function skill(id: string): Skill {
  return { id, name: id, category: 'Test', description: null };
}
function edge(skillId: string, prerequisiteSkillId: string): SkillPrerequisite {
  return { skillId, prerequisiteSkillId, relationshipType: 'PREREQUISITE' };
}

test('detects no cycle in a valid DAG', () => {
  const graph = buildSkillGraph([skill('A'), skill('B'), skill('C')], [edge('B', 'A'), edge('C', 'B')]);
  assert.equal(detectCycle(graph).hasCycle, false);
});

test('detects a real cycle A->B->C->A', () => {
  const graph = buildSkillGraph([skill('A'), skill('B'), skill('C')], [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')]);
  const result = detectCycle(graph);
  assert.equal(result.hasCycle, true);
  assert.ok(result.cycle && result.cycle.length >= 3);
});

test('blocking power counts transitive downstream dependents (Queues blocks BFS, GraphTraversal, and Graphs)', () => {
  // Queues <- BFS <- GraphTraversal <- Graphs  (edge(X, Y) means X requires Y)
  const graph = buildSkillGraph(
    [skill('Queues'), skill('BFS'), skill('GraphTraversal'), skill('Graphs'), skill('Unrelated')],
    [edge('BFS', 'Queues'), edge('GraphTraversal', 'BFS'), edge('Graphs', 'GraphTraversal')]
  );
  const blocking = computeBlockingPower(graph);
  assert.equal(blocking.get('Queues'), 3); // blocks BFS, GraphTraversal, Graphs
  assert.equal(blocking.get('BFS'), 2); // blocks GraphTraversal, Graphs
  assert.equal(blocking.get('Graphs'), 0); // blocks nothing further
  assert.equal(blocking.get('Unrelated'), 0);
});

test('resolvePrerequisiteChain returns prerequisites deepest-first', () => {
  const graph = buildSkillGraph(
    [skill('Queues'), skill('BFS'), skill('GraphTraversal'), skill('Graphs')],
    [edge('BFS', 'Queues'), edge('GraphTraversal', 'BFS'), edge('Graphs', 'GraphTraversal')]
  );
  const chain = resolvePrerequisiteChain(graph, 'Graphs');
  assert.deepEqual(chain, ['Queues', 'BFS', 'GraphTraversal']);
});

test('computeLayers assigns increasing layers along a chain restricted to the included set', () => {
  const graph = buildSkillGraph(
    [skill('Queues'), skill('BFS'), skill('GraphTraversal'), skill('Graphs')],
    [edge('BFS', 'Queues'), edge('GraphTraversal', 'BFS'), edge('Graphs', 'GraphTraversal')]
  );
  const layers = computeLayers(graph, new Set(['Queues', 'BFS', 'GraphTraversal', 'Graphs']));
  assert.equal(layers.get('Queues'), 0);
  assert.equal(layers.get('BFS'), 1);
  assert.equal(layers.get('GraphTraversal'), 2);
  assert.equal(layers.get('Graphs'), 3);
});

test('a cycle does not cause infinite recursion in blocking power computation', () => {
  const graph = buildSkillGraph([skill('A'), skill('B')], [edge('A', 'B'), edge('B', 'A')]);
  assert.doesNotThrow(() => computeBlockingPower(graph));
});
