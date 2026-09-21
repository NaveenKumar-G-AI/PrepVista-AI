import { loadGraphSnapshot } from './graphQuery.service';
import { getDownstreamSkills } from './graphTraversal.service';
import { getStudentSkillGraph, getUpstreamWithState } from './studentSkillState.service';
import { studentStateRepository } from '../repositories/studentState.repository';
import { analyzeRootCause } from './rootCause.service';
import { computePrioritySignal } from './prioritySignal.service';
import { adapters } from '../integrations';
import type { PrioritySignal, RootCauseSignal, EvidenceAggregate } from '../domain/types';

/** Section 29-30: root-cause / prerequisite-gap investigation for one skill. */
export async function getRootCauseSignal(studentId: string, skillCode: string): Promise<RootCauseSignal> {
  const snapshot = await loadGraphSnapshot('PUBLISHED');
  const targetNode = snapshot.nodesByCode.get(skillCode);
  if (!targetNode) {
    return {
      target_skill: skillCode,
      possible_prerequisite_gap: null,
      evidence: { target_capability: null, prerequisite_capability: null },
      confidence: 'insufficient_evidence',
      note: `"${skillCode}" is not a published skill in the current graph version.`,
    };
  }

  const targetRow = await studentStateRepository.findOne(studentId, targetNode.id);
  const targetState: EvidenceAggregate = targetRow
    ? { capability: targetRow.capability, state: targetRow.state as EvidenceAggregate['state'], trend: targetRow.trend as EvidenceAggregate['trend'], evidenceCount: targetRow.evidenceCount, confidence: targetRow.confidence as EvidenceAggregate['confidence'] }
    : { capability: null, state: 'UNKNOWN', trend: null, evidenceCount: 0, confidence: 'NONE' };

  const upstream = await getUpstreamWithState(studentId, targetNode.id, 3);

  return analyzeRootCause({
    targetSkillCode: skillCode,
    targetState,
    prerequisites: upstream,
  });
}

/**
 * Section 34-36: ranked "highest-leverage skill" candidates for a student's
 * active goal. Combines goal relevance + weakness + evidence + structural
 * importance — never structural importance alone.
 */
export async function getPrioritySignals(studentId: string): Promise<{ goal: { id: string; label: string } | null; priorities: PrioritySignal[] }> {
  const goal = await adapters.goal.getActiveGoal(studentId);
  const snapshot = await loadGraphSnapshot('PUBLISHED');
  const studentSkills = await getStudentSkillGraph(studentId);
  const stateByCode = new Map(studentSkills.map((s) => [s.code, s]));

  const goalRelevantCodes = new Set(goal?.skillCodes ?? []);

  // Only rank SKILL/SUBSKILL-level nodes — CATEGORY/DOMAIN rollups aren't actionable targets.
  const candidateNodes = snapshot.nodes.filter((n) => n.level === 'SKILL' || n.level === 'SUBSKILL');

  const downstreamCounts = candidateNodes.map((n) => getDownstreamSkills(n.id, snapshot.edges, 3).size);
  const maxDownstreamInSet = Math.max(1, ...downstreamCounts);

  const signals: PrioritySignal[] = candidateNodes.map((node, idx) => {
    const studentView = stateByCode.get(node.code);
    return computePrioritySignal({
      skillCode: node.code,
      displayName: node.displayName,
      capability: studentView?.capability ?? null,
      confidence: (studentView?.confidence as PrioritySignal['signals']['evidenceConfidence']) ?? 'NONE',
      isGoalRelevant: goalRelevantCodes.has(node.code),
      downstreamCount: downstreamCounts[idx],
      maxDownstreamInSet,
    });
  });

  signals.sort((a, b) => b.leverageScore - a.leverageScore);

  return {
    goal: goal ? { id: goal.goalId, label: goal.label } : null,
    priorities: signals,
  };
}
