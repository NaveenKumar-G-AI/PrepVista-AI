import { test, assertLess, assertEqual, assertTrue } from './harness';
import { computeTargetDifficulty } from '../src/engine/difficultyAdaptation';
import { SkillEvidencePoint } from '../src/types';

function mkEv(overrides: Partial<SkillEvidencePoint>): SkillEvidencePoint {
  return {
    skillId: 's',
    timestamp: new Date().toISOString(),
    outcome: 'SUCCESS',
    challengeId: `c-${Math.random().toString(36).slice(2, 6)}`,
    dimensionsExercised: { algorithm: 50, state: 50, reasoning: 50, debugging: 50 },
    ...overrides,
  };
}

test('remediation after 2 consecutive failures reduces only the identified bottleneck dimension', () => {
  const evidence: SkillEvidencePoint[] = [
    mkEv({ outcome: 'SUCCESS', dimensionsExercised: { algorithm: 55, state: 55 } }),
    mkEv({ outcome: 'FAILURE', dimensionsExercised: { algorithm: 55, state: 55 }, understandingScore: 25 }),
    mkEv({ outcome: 'FAILURE', dimensionsExercised: { algorithm: 55, state: 55 }, understandingScore: 20 }),
  ];
  const target = computeTargetDifficulty(evidence, 'REMEDIATION', 2, 0);
  assertLess(target.state, 55, 'state dimension (the diagnosed bottleneck) should be reduced');
  assertEqual(target.algorithm, 55, 'algorithm dimension should be held steady, not also reduced');
});

test('a single failure leaves the target difficulty vector unchanged (overfit guard)', () => {
  const evidence: SkillEvidencePoint[] = [
    mkEv({ outcome: 'SUCCESS', dimensionsExercised: { algorithm: 55, state: 55 } }),
    mkEv({ outcome: 'FAILURE', dimensionsExercised: { algorithm: 55, state: 55 } }),
  ];
  const target = computeTargetDifficulty(evidence, 'REMEDIATION', 1, 0);
  assertEqual(target.state, 55, 'single failure should not move the target vector');
});

test('progression after one success only partially advances difficulty vs. a confirmed second success', () => {
  const evidence: SkillEvidencePoint[] = [mkEv({ outcome: 'SUCCESS', dimensionsExercised: { algorithm: 50 } })];
  const partial = computeTargetDifficulty(evidence, 'PROGRESSION', 0, 1);
  const confirmed = computeTargetDifficulty(evidence, 'PROGRESSION', 0, 2);
  assertTrue(partial.algorithm < confirmed.algorithm, 'one success should move difficulty less than a confirmed second success');
});

test('transfer intent raises the transfer dimension while holding algorithm steady', () => {
  const evidence: SkillEvidencePoint[] = [mkEv({ outcome: 'SUCCESS', dimensionsExercised: { algorithm: 60, transfer: 30 } })];
  const target = computeTargetDifficulty(evidence, 'TRANSFER', 0, 0);
  assertEqual(target.algorithm, 60, 'algorithm should be held steady during a transfer-focused challenge');
  assertTrue(target.transfer > 30, 'transfer dimension should increase');
});
