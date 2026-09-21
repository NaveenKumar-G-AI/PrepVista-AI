import { describe, it, expect } from 'vitest';
import {
  analyzeTimeSegments, detectLateTestDegradation, analyzeRecoveryPattern, analyzeQuestionStrategy,
} from '../domain/simulationAnalysis.js';
import type { SessionResponse } from '../domain/types.js';

function mk(overrides: Partial<SessionResponse>): SessionResponse {
  return {
    studentId: 's1', sessionId: 'sess1', questionIndex: 0, capability: 'arrays', difficulty: 'MEDIUM',
    novelty: 'RELATED', isCorrect: true, timeTakenMs: 30_000, expectedTimeMs: 30_000,
    skipped: false, changedAnswer: false, stalled: false,
    ...overrides,
  };
}

describe('analyzeTimeSegments / detectLateTestDegradation', () => {
  it('computes per-segment accuracy and flags a real late-test drop', () => {
    const responses: SessionResponse[] = [
      mk({ questionIndex: 0, isCorrect: true }),
      mk({ questionIndex: 1, isCorrect: true }),
      mk({ questionIndex: 2, isCorrect: true }),
      mk({ questionIndex: 3, isCorrect: false }),
      mk({ questionIndex: 4, isCorrect: true }),
      mk({ questionIndex: 5, isCorrect: false }),
      mk({ questionIndex: 6, isCorrect: false }),
      mk({ questionIndex: 7, isCorrect: false }),
    ];
    const segments = analyzeTimeSegments(responses);
    const first = segments.find((s) => s.segment === 'FIRST_QUARTER')!;
    const final = segments.find((s) => s.segment === 'FINAL_QUARTER')!;
    expect(first.accuracy).toBe(1);
    expect(final.accuracy).toBe(0);
    expect(detectLateTestDegradation(segments, 0.15)).toBe(true);
  });

  it('does not flag degradation when performance holds steady throughout', () => {
    const responses: SessionResponse[] = Array.from({ length: 8 }).map((_, i) => mk({ questionIndex: i, isCorrect: i % 2 === 0 }));
    const segments = analyzeTimeSegments(responses);
    expect(detectLateTestDegradation(segments, 0.15)).toBe(false);
  });
});

describe('analyzeRecoveryPattern', () => {
  it('flags longStallFollowedByInaccuracy when a stalled hard question is followed by a wrong answer', () => {
    const responses: SessionResponse[] = [
      mk({ questionIndex: 0, difficulty: 'EASY', isCorrect: true }),
      mk({ questionIndex: 1, difficulty: 'HARD', isCorrect: false, stalled: true }),
      mk({ questionIndex: 2, difficulty: 'MEDIUM', isCorrect: false }),
      mk({ questionIndex: 3, difficulty: 'EASY', isCorrect: true }),
    ];
    const recovery = analyzeRecoveryPattern(responses);
    expect(recovery.longStallFollowedByInaccuracy).toBe(true);
    expect(recovery.maintainsPerformanceAfterDifficulty).toBe(false);
  });

  it('recognizes maintained performance after a difficult question', () => {
    const responses: SessionResponse[] = [
      mk({ questionIndex: 0, difficulty: 'HARD', isCorrect: false, stalled: true }),
      mk({ questionIndex: 1, difficulty: 'MEDIUM', isCorrect: true }),
      mk({ questionIndex: 2, difficulty: 'HARD', isCorrect: false, stalled: true }),
      mk({ questionIndex: 3, difficulty: 'MEDIUM', isCorrect: true }),
    ];
    const recovery = analyzeRecoveryPattern(responses);
    expect(recovery.maintainsPerformanceAfterDifficulty).toBe(true);
    expect(recovery.longStallFollowedByInaccuracy).toBe(false);
  });
});

describe('analyzeQuestionStrategy', () => {
  it('computes skip rate, change rate, stall count and rapid-response count from observed behavior only', () => {
    const responses: SessionResponse[] = [
      mk({ questionIndex: 0, skipped: true, timeTakenMs: 1_000 }),
      mk({ questionIndex: 1, changedAnswer: true, timeTakenMs: 40_000 }),
      mk({ questionIndex: 2, stalled: true, timeTakenMs: 120_000 }),
      mk({ questionIndex: 3, timeTakenMs: 2_000 }),
    ];
    const strategy = analyzeQuestionStrategy(responses);
    expect(strategy.skipRate).toBeCloseTo(0.25);
    expect(strategy.answerChangeRate).toBeCloseTo(0.25);
    expect(strategy.longStallCount).toBe(1);
    expect(strategy.rapidResponseCount).toBe(1);
  });
});
