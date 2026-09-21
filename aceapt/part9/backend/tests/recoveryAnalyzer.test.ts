import { describe, expect, it } from 'vitest';
import { RecoveryAnalyzer } from '../src/services/recoveryAnalyzer';
import { AnswerRecord } from '../src/domain/types';

const recovery = new RecoveryAnalyzer();

function seq(pattern: boolean[]): AnswerRecord[] {
  return pattern.map((isCorrect, i) => ({
    questionId: `q${i}`,
    selectedOptionId: 'a',
    previousOptionIds: [],
    isCorrect,
    firstOpenedAt: 0,
    answeredAt: 0,
    timeSpentSeconds: 40,
    skipped: false,
    returned: false,
    remainingTimeFractionAtAnswer: 0.5,
  }));
}

describe('RecoveryAnalyzer', () => {
  it('detects recovery: 3 consecutive wrong, then 4 of the next 5 correct (spec worked example)', () => {
    const answers = seq([
      true, true,
      false, false, false, // 3-wrong streak
      true, true, true, false, true, // 4/5 correct afterwards
    ]);

    const finding = recovery.analyze(answers);

    expect(finding.streaks).toHaveLength(1);
    expect(finding.streaks[0].length).toBe(3);
    expect(finding.streaks[0].recovered).toBe(true);
    expect(finding.detected).toBe(true);
    expect(recovery.score(finding)).toBe(100);
  });

  it('does not flag recovery when the mistake streak is only 2 long', () => {
    const answers = seq([true, false, false, true, true]);
    const finding = recovery.analyze(answers);
    expect(finding.streaks).toHaveLength(0);
    expect(finding.detected).toBe(false);
  });

  it('reports non-recovery when accuracy stays low after a long mistake streak', () => {
    const answers = seq([
      false, false, false, false,
      false, false, false, false, false,
    ]);
    const finding = recovery.analyze(answers);
    expect(finding.streaks.length).toBeGreaterThan(0);
    expect(finding.streaks[0].recovered).toBe(false);
    expect(finding.detected).toBe(false);
    expect(recovery.score(finding)).toBe(0);
  });

  it('scores 100 (nothing to recover from) when there are no mistake streaks', () => {
    const answers = seq([true, true, true, true]);
    const finding = recovery.analyze(answers);
    expect(finding.streaks).toHaveLength(0);
    expect(recovery.score(finding)).toBe(100);
  });
});
