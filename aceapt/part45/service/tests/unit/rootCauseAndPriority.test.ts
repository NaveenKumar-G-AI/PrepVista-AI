import { analyzeRootCause } from '../../src/services/rootCause.service';
import { computePrioritySignal } from '../../src/services/prioritySignal.service';
import type { EvidenceAggregate } from '../../src/domain/types';

function agg(capability: number | null, confidence: EvidenceAggregate['confidence'] = 'MODERATE'): EvidenceAggregate {
  return { capability, confidence, evidenceCount: capability === null ? 0 : 5, state: capability === null ? 'UNKNOWN' : capability >= 60 ? 'STRONG' : 'DEVELOPING', trend: null };
}

describe('rootCause.service', () => {
  test('flags a weak prerequisite for a weak target, hedged as moderate/low confidence, never "confirmed"', () => {
    const signal = analyzeRootCause({
      targetSkillCode: 'QUANT.PROBABILITY',
      targetState: agg(42),
      prerequisites: [{ code: 'QUANT.COMBINATION', state: agg(37), hopDistance: 1 }],
    });
    expect(signal.possible_prerequisite_gap).toBe('QUANT.COMBINATION');
    expect(['low', 'moderate', 'high']).toContain(signal.confidence);
    expect(signal.confidence).not.toBe('high'); // correlation, not proof — see note text too
  });

  test('does not flag a prerequisite gap when the target is not actually weak', () => {
    const signal = analyzeRootCause({ targetSkillCode: 'QUANT.RATIO', targetState: agg(80), prerequisites: [] });
    expect(signal.possible_prerequisite_gap).toBeNull();
    expect(signal.confidence).toBe('insufficient_evidence');
  });

  test('never fabricates a signal when the target itself has no evidence', () => {
    const signal = analyzeRootCause({ targetSkillCode: 'QUANT.GEOMETRY', targetState: agg(null), prerequisites: [] });
    expect(signal.evidence.target_capability).toBeNull();
    expect(signal.confidence).toBe('insufficient_evidence');
  });

  test('a weak target with only STRONG prerequisites does not get a fabricated gap', () => {
    const signal = analyzeRootCause({
      targetSkillCode: 'X',
      targetState: agg(40),
      prerequisites: [{ code: 'Y', state: agg(90), hopDistance: 1 }],
    });
    expect(signal.possible_prerequisite_gap).toBeNull();
  });

  test('prefers the closer hop when multiple prerequisites are weak', () => {
    const signal = analyzeRootCause({
      targetSkillCode: 'X',
      targetState: agg(30),
      prerequisites: [
        { code: 'FAR', state: agg(20), hopDistance: 2 },
        { code: 'NEAR', state: agg(45), hopDistance: 1 },
      ],
    });
    expect(signal.possible_prerequisite_gap).toBe('NEAR');
  });
});

describe('prioritySignal.service', () => {
  test('a goal-relevant, weak, well-evidenced, structurally-important skill is a highest-leverage candidate', () => {
    const signal = computePrioritySignal({
      skillCode: 'LOGIC.PUZZLE_REASONING',
      displayName: 'Puzzle Reasoning',
      capability: 33,
      confidence: 'MODERATE',
      isGoalRelevant: true,
      downstreamCount: 2,
      maxDownstreamInSet: 5,
    });
    expect(signal.isHighestLeverageCandidate).toBe(true);
  });

  test('structural importance alone does NOT make a non-goal, non-weak skill a leverage candidate', () => {
    const signal = computePrioritySignal({
      skillCode: 'QUANT.PERCENTAGES',
      displayName: 'Percentages',
      capability: 94,
      confidence: 'HIGH',
      isGoalRelevant: false,
      downstreamCount: 5, // the MOST structurally important skill in the set
      maxDownstreamInSet: 5,
    });
    expect(signal.isHighestLeverageCandidate).toBe(false);
  });

  test('an UNKNOWN skill (capability=null) is never treated as "weak" for prioritization', () => {
    const signal = computePrioritySignal({
      skillCode: 'QUANT.GEOMETRY',
      displayName: 'Geometry',
      capability: null,
      confidence: 'NONE',
      isGoalRelevant: true,
      downstreamCount: 1,
      maxDownstreamInSet: 5,
    });
    expect(signal.signals.weaknessScore).toBeNull();
    expect(signal.isHighestLeverageCandidate).toBe(false);
  });

  test('zero evidence confidence suppresses the score even for an otherwise strong candidate', () => {
    const withEvidence = computePrioritySignal({ skillCode: 'A', displayName: 'A', capability: 30, confidence: 'HIGH', isGoalRelevant: true, downstreamCount: 3, maxDownstreamInSet: 3 });
    const noEvidence = computePrioritySignal({ skillCode: 'B', displayName: 'B', capability: 30, confidence: 'NONE', isGoalRelevant: true, downstreamCount: 3, maxDownstreamInSet: 3 });
    expect(noEvidence.leverageScore).toBeLessThan(withEvidence.leverageScore);
  });

  test('every signal includes a human-readable explanation', () => {
    const signal = computePrioritySignal({ skillCode: 'A', displayName: 'A', capability: 40, confidence: 'MODERATE', isGoalRelevant: true, downstreamCount: 1, maxDownstreamInSet: 2 });
    expect(signal.explanation.length).toBeGreaterThan(0);
  });
});
