import { test, assertTrue, assertGreater } from './harness';
import { computeSkillState } from '../src/evidence/aggregateEvidence';
import { SkillEvidencePoint } from '../src/types';

function mkEvidence(overrides: Partial<SkillEvidencePoint> & { daysAgo: number }): SkillEvidencePoint {
  const ts = new Date(Date.now() - overrides.daysAgo * 86_400_000).toISOString();
  return {
    skillId: 'hashing',
    timestamp: ts,
    outcome: 'SUCCESS',
    challengeId: `c-${overrides.daysAgo}-${Math.random().toString(36).slice(2, 6)}`,
    correctness: 0.9,
    dimensionsExercised: {},
    ...overrides,
  };
}

test('8 successes + 1 recent failure does not trigger beginner-level classification (one-off failure)', () => {
  const evidence: SkillEvidencePoint[] = [];
  for (let i = 8; i >= 1; i--) {
    evidence.push(
      mkEvidence({ daysAgo: i * 5, outcome: 'SUCCESS', correctness: 0.9, challengeFamily: `fam-${i}`, transferGroup: `fam-${i}` })
    );
  }
  evidence.push(mkEvidence({ daysAgo: 1, outcome: 'FAILURE', correctness: 0.1, understandingScore: 40 }));

  const state = computeSkillState('hashing', evidence);
  assertTrue(
    !['UNKNOWN', 'INTRODUCED', 'DEVELOPING'].includes(state.level),
    `one failure after 8 successes should not cause beginner-level classification, got ${state.level}`
  );
  assertGreater(state.score, 55, 'score should remain solidly above beginner range');
});

test('a single hard success does not alone establish MASTERED (one-off success)', () => {
  const evidence: SkillEvidencePoint[] = [
    mkEvidence({ daysAgo: 1, outcome: 'SUCCESS', correctness: 1.0, reasoningScore: 95, understandingScore: 95 }),
  ];
  const state = computeSkillState('recursion', evidence);
  assertTrue(state.level !== 'MASTERED', `single success must not establish MASTERED, got ${state.level}`);
});

test('repeated diversified success establishes a strong classification', () => {
  const evidence: SkillEvidencePoint[] = [];
  const families = ['array', 'string', 'stream', 'graph', 'matrix'];
  for (let i = 0; i < 5; i++) {
    evidence.push(
      mkEvidence({
        daysAgo: (5 - i) * 4,
        outcome: 'SUCCESS',
        correctness: 0.95,
        understandingScore: 90,
        reasoningScore: 88,
        challengeFamily: families[i],
        transferGroup: families[i],
      })
    );
  }
  const state = computeSkillState('hashing', evidence);
  assertTrue(
    state.level === 'MASTERED' || state.level === 'PROFICIENT',
    `repeated diversified success should read as strong, got ${state.level}`
  );
  assertGreater(state.confidence, 0.6, 'confidence should be reasonably high with 5 diverse events');
});

test('a long-mastered skill with one recent struggle is not reclassified as beginner', () => {
  const evidence: SkillEvidencePoint[] = [];
  const families = ['array', 'string', 'stream', 'graph'];
  for (let i = 0; i < 4; i++) {
    evidence.push(
      mkEvidence({
        daysAgo: 90 + (4 - i) * 10,
        outcome: 'SUCCESS',
        correctness: 0.95,
        understandingScore: 90,
        reasoningScore: 88,
        challengeFamily: families[i],
        transferGroup: families[i],
      })
    );
  }
  evidence.push(mkEvidence({ daysAgo: 2, outcome: 'FAILURE', correctness: 0.2 }));

  const state = computeSkillState('hashing', evidence);
  assertTrue(
    !['UNKNOWN', 'INTRODUCED', 'DEVELOPING'].includes(state.level),
    `one recent struggle after historical mastery should prompt a retention check, not beginner classification (got ${state.level})`
  );
});
