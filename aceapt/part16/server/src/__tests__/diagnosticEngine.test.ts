import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../engine/diagnosticEngine';
import { AttemptEvidence, StudentSkillHistory } from '../types/evidence';
import { RootCause, Confidence } from '../types/rootCause';

function baseEvidence(overrides: Partial<AttemptEvidence> = {}): AttemptEvidence {
  return {
    studentId: 's1',
    skillId: 'skill_profit_loss',
    questionId: 'q1',
    correct: false,
    responseTimeSeconds: 55,
    expectedTimeSeconds: 55,
    difficulty: 'medium',
    questionType: 'standard',
    hintsUsed: 0,
    prerequisiteSkillIds: ['skill_percentage'],
    ...overrides,
  };
}

function baseHistory(overrides: Partial<StudentSkillHistory> = {}): StudentSkillHistory {
  return {
    studentId: 's1',
    skillId: 'skill_profit_loss',
    recentAccuracy: [],
    historicalAccuracy: [],
    masteryState: 'developing',
    transferState: 'not_assessed',
    retentionState: 'stable',
    readinessState: 'developing',
    interventionHistory: [],
    ...overrides,
  };
}

test('correct attempt produces no root cause', () => {
  const d = diagnose(baseEvidence({ correct: true }), baseHistory());
  assert.equal(d.uiPanel.likelyIssueLabel, 'No issue detected');
  assert.equal(d.insufficientEvidence, false);
});

test('thin evidence does not produce a confident diagnosis', () => {
  const d = diagnose(baseEvidence(), baseHistory());
  assert.equal(d.insufficientEvidence, true);
  assert.equal(d.primary.confidence, Confidence.LOW);
});

test('step-level evidence detects a strategy gap with high confidence when prior steps are correct', () => {
  const evidence = baseEvidence({
    solutionPath: [
      { stepNumber: 1, description: 'Identified the problem type.', stepType: 'concept', correct: true },
      { stepNumber: 2, description: 'Chose the wrong formula direction.', stepType: 'strategy', correct: false },
      { stepNumber: 3, description: 'Executed the arithmetic correctly.', stepType: 'calculation', correct: true },
    ],
  });
  const d = diagnose(evidence, baseHistory());
  assert.equal(d.primary.cause, RootCause.STRATEGY_GAP);
  assert.equal(d.primary.confidence, Confidence.HIGH);
  assert.equal(d.uiPanel.conceptStatus, 'ok');
  assert.equal(d.uiPanel.methodStatus, 'warning');
  assert.equal(d.uiPanel.calculationStatus, 'ok');
});

test('step-level evidence detects a calculation error', () => {
  const evidence = baseEvidence({
    solutionPath: [
      { stepNumber: 1, description: 'Identified the problem type.', stepType: 'concept', correct: true },
      { stepNumber: 2, description: 'Chose the right formula.', stepType: 'strategy', correct: true },
      { stepNumber: 3, description: 'Made an arithmetic slip.', stepType: 'calculation', correct: false },
    ],
  });
  const d = diagnose(evidence, baseHistory());
  assert.equal(d.primary.cause, RootCause.CALCULATION_ERROR);
  assert.equal(d.primary.confidence, Confidence.HIGH);
});

test('weak prerequisite accuracy is diagnosed as a prerequisite gap, not a concept gap', () => {
  const history = baseHistory({
    recentAccuracy: [
      { skillId: 'skill_profit_loss', accuracy: 0.4, sampleSize: 5 },
      { skillId: 'skill_percentage', accuracy: 0.3, sampleSize: 6 },
    ],
  });
  const d = diagnose(baseEvidence(), history);
  assert.equal(d.primary.cause, RootCause.PREREQUISITE_GAP);
});

test('self-report is a strong, direct signal', () => {
  const d = diagnose(baseEvidence({ selfReportedReasonCode: 'no_method' }), baseHistory());
  assert.equal(d.primary.cause, RootCause.STRATEGY_GAP);
  assert.equal(d.primary.confidence, Confidence.HIGH);
});

test('previously-mastered skill now failing is retention, not a fresh concept gap', () => {
  const history = baseHistory({ masteryState: 'mastered' });
  const d = diagnose(baseEvidence(), history);
  assert.equal(d.primary.cause, RootCause.RETENTION_GAP);
});

test('strong on familiar, weak on unfamiliar framing -> transfer gap', () => {
  const history = baseHistory({
    recentAccuracy: [{ skillId: 'skill_profit_loss', accuracy: 0.85, sampleSize: 8 }],
  });
  const d = diagnose(baseEvidence({ questionType: 'unfamiliar_context' }), history);
  assert.equal(d.primary.cause, RootCause.TRANSFER_GAP);
});

test('strong normal practice but failing under exam simulation -> assessment-condition gap', () => {
  const history = baseHistory({
    recentAccuracy: [{ skillId: 'skill_profit_loss', accuracy: 0.85, sampleSize: 8 }],
  });
  const d = diagnose(baseEvidence({ questionType: 'exam_simulation' }), history);
  assert.equal(d.primary.cause, RootCause.ASSESSMENT_CONDITION_GAP);
});

test('multi-factor: weak prerequisite outranks a slow-response signal', () => {
  const history = baseHistory({
    recentAccuracy: [
      { skillId: 'skill_profit_loss', accuracy: 0.4, sampleSize: 5 },
      { skillId: 'skill_percentage', accuracy: 0.3, sampleSize: 6 },
    ],
  });
  const d = diagnose(baseEvidence({ responseTimeSeconds: 120, expectedTimeSeconds: 55 }), history);
  assert.equal(d.isMultiFactor, true);
  assert.equal(d.primary.cause, RootCause.PREREQUISITE_GAP);
});
