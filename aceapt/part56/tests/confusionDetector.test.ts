import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTrainingAttemptRepository } from '../src/repositories';
import { ConfusionDetector } from '../src/confusion/confusionDetector';
import { FormulaTrainingAttempt } from '../src/types';

function makeAttempt(overrides: Partial<FormulaTrainingAttempt>): FormulaTrainingAttempt {
  return {
    id: Math.random().toString(36).slice(2),
    sessionId: 's1',
    studentId: 'student-1',
    formulaId: 'fx-simple-interest',
    formulaVersionAtAttempt: 1,
    activityType: 'SELECT',
    correct: false,
    errorType: 'FORMULA_CONDITION_ERROR',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ConfusionDetector', () => {
  let repo: InMemoryTrainingAttemptRepository;
  let detector: ConfusionDetector;

  beforeEach(() => {
    repo = new InMemoryTrainingAttemptRepository();
    detector = new ConfusionDetector(repo);
  });

  it('does not flag a pattern from a single mix-up (spec section 37: repeated, not one-off)', async () => {
    await repo.saveAttempt(makeAttempt({ distractorFormulaId: 'fx-compound-interest' }));
    const flagged = await detector.getConfusionPattern('student-1', 'fx-simple-interest', 'fx-compound-interest');
    expect(flagged).toBe(false);
  });

  it('flags a pattern once the same pair is mixed up repeatedly (spec test 216)', async () => {
    await repo.saveAttempt(makeAttempt({ distractorFormulaId: 'fx-compound-interest' }));
    await repo.saveAttempt(
      makeAttempt({ formulaId: 'fx-compound-interest', distractorFormulaId: 'fx-simple-interest' }),
    );
    const flagged = await detector.getConfusionPattern('student-1', 'fx-simple-interest', 'fx-compound-interest');
    expect(flagged).toBe(true);
  });

  it('is not resolved without a correct discrimination streak', async () => {
    await repo.saveAttempt(makeAttempt({ distractorFormulaId: 'fx-compound-interest', involvedConfusionPair: true }));
    const resolved = await detector.isConfusionResolved('student-1', 'fx-simple-interest', 'fx-compound-interest');
    expect(resolved).toBe(false);
  });

  it('resolves once a correct discrimination streak is reached (spec section 185)', async () => {
    for (let i = 0; i < 3; i++) {
      await repo.saveAttempt(
        makeAttempt({ correct: true, errorType: null, involvedConfusionPair: true, distractorFormulaId: undefined }),
      );
    }
    const resolved = await detector.isConfusionResolved('student-1', 'fx-simple-interest', 'fx-compound-interest');
    expect(resolved).toBe(true);
  });

  it('ranks the most frequent confusion pair first (spec section 156)', async () => {
    await repo.saveAttempt(makeAttempt({ distractorFormulaId: 'fx-compound-interest' }));
    await repo.saveAttempt(makeAttempt({ distractorFormulaId: 'fx-compound-interest' }));
    await repo.saveAttempt(
      makeAttempt({ formulaId: 'fx-speed-distance-time', distractorFormulaId: 'fx-simple-interest' }),
    );
    const top = await detector.getTopConfusionPairs('student-1', 1);
    expect(top[0].pair.slice().sort()).toEqual(['fx-compound-interest', 'fx-simple-interest'].sort());
    expect(top[0].count).toBe(2);
  });
});
