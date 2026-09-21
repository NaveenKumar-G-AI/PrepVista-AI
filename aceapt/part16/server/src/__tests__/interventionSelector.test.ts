import test from 'node:test';
import assert from 'node:assert/strict';
import { selectIntervention } from '../engine/interventionSelector';
import { Diagnosis } from '../types/diagnosis';
import { RootCause, Confidence } from '../types/rootCause';
import { InterventionType, EscalationLevel } from '../types/intervention';
import { InterventionHistoryEntry } from '../types/evidence';
import { StudentInterventionProfile } from '../types/domain';

function strategyGapDiagnosis(): Diagnosis {
  return {
    attemptId: 'a1',
    studentId: 's1',
    skillId: 'skill_profit_loss',
    primary: { cause: RootCause.STRATEGY_GAP, confidence: Confidence.HIGH, evidenceSummary: 'test' },
    secondary: [],
    isMultiFactor: false,
    insufficientEvidence: false,
    uiPanel: { conceptStatus: 'ok', methodStatus: 'warning', calculationStatus: 'ok', likelyIssueLabel: 'Strategy selection gap' },
    createdAt: new Date().toISOString(),
  };
}

function emptyProfile(): StudentInterventionProfile {
  return { studentId: 's1', stats: [] };
}

test('first-time strategy gap gets the first-line intervention with low escalation', () => {
  const rec = selectIntervention(strategyGapDiagnosis(), [], emptyProfile());
  assert.equal(rec.interventionType, InterventionType.STRATEGY_SELECTION);
  assert.equal(rec.escalationLevel, EscalationLevel.L1_HINT);
});

test('a failed intervention type is never recommended again for the same cause (failed-intervention memory)', () => {
  const history: InterventionHistoryEntry[] = [
    {
      interventionId: 'i1',
      skillId: 'skill_profit_loss',
      rootCause: RootCause.STRATEGY_GAP,
      interventionType: InterventionType.STRATEGY_SELECTION,
      escalationLevel: EscalationLevel.L1_HINT,
      outcome: 'not_improved',
      createdAt: new Date().toISOString(),
    },
  ];
  const rec = selectIntervention(strategyGapDiagnosis(), history, emptyProfile());
  assert.notEqual(rec.interventionType, InterventionType.STRATEGY_SELECTION);
  assert.equal(rec.interventionType, InterventionType.CONTRAST_TRAINING);
});

test('escalation level rises as more intervention types fail for the same cause', () => {
  const makeEntry = (type: InterventionType): InterventionHistoryEntry => ({
    interventionId: `i_${type}`,
    skillId: 'skill_profit_loss',
    rootCause: RootCause.STRATEGY_GAP,
    interventionType: type,
    escalationLevel: EscalationLevel.L1_HINT,
    outcome: 'not_improved',
    createdAt: new Date().toISOString(),
  });

  const oneFailed = selectIntervention(strategyGapDiagnosis(), [makeEntry(InterventionType.STRATEGY_SELECTION)], emptyProfile());
  const twoFailed = selectIntervention(
    strategyGapDiagnosis(),
    [makeEntry(InterventionType.STRATEGY_SELECTION), makeEntry(InterventionType.CONTRAST_TRAINING)],
    emptyProfile()
  );

  assert.ok(twoFailed.escalationLevel >= oneFailed.escalationLevel);
});

test('when every chain option has failed, the selector still returns a safe fallback rather than repeating a failure', () => {
  const chain = [
    InterventionType.STRATEGY_SELECTION,
    InterventionType.CONTRAST_TRAINING,
    InterventionType.GUIDED_PRACTICE,
    InterventionType.INDEPENDENT_PRACTICE,
    InterventionType.TRANSFER_CHALLENGE,
  ];
  const history: InterventionHistoryEntry[] = chain.map((type) => ({
    interventionId: `i_${type}`,
    skillId: 'skill_profit_loss',
    rootCause: RootCause.STRATEGY_GAP,
    interventionType: type,
    escalationLevel: EscalationLevel.L1_HINT,
    outcome: 'not_improved',
    createdAt: new Date().toISOString(),
  }));

  const rec = selectIntervention(strategyGapDiagnosis(), history, emptyProfile());
  assert.ok(!chain.includes(rec.interventionType) || rec.escalationLevel >= EscalationLevel.L6_ALTERNATIVE_STRATEGY);
  assert.equal(rec.escalationLevel, EscalationLevel.L7_DEEP_REMEDIATION);
});
