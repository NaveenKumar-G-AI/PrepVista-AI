import { describe, expect, it, vi } from 'vitest';
import { TimerService } from '../src/services/timerService';
import { Simulation } from '../src/domain/types';

function baseSim(overrides: Partial<Simulation> = {}): Simulation {
  return {
    id: 's1',
    studentId: 'stu1',
    blueprintId: 'quick-simulation-v1',
    mode: 'QUICK_SIMULATION',
    pressureMode: 'NORMAL',
    status: 'IN_PROGRESS',
    questionRefs: [],
    answers: {},
    startedAt: Date.now(),
    completedAt: null,
    durationSeconds: 600,
    negativeMarking: { correct: 1, wrong: 0, skipped: 0 },
    hideTopicLabels: true,
    currentQuestionIndex: 0,
    ...overrides,
  };
}

describe('TimerService', () => {
  it('reports the full duration remaining right after start', () => {
    const timer = new TimerService();
    const sim = baseSim({ startedAt: Date.now() });
    expect(timer.remainingSeconds(sim)).toBeGreaterThan(590);
    expect(timer.isExpired(sim)).toBe(false);
  });

  it('is authoritative on the server clock, not any client-supplied value', () => {
    const timer = new TimerService();
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const sim = baseSim({ startedAt: now - 605_000, durationSeconds: 600 });
    expect(timer.isExpired(sim)).toBe(true);
    expect(timer.remainingSeconds(sim)).toBe(0);
    vi.restoreAllMocks();
  });

  it('computes remaining fraction proportionally', () => {
    const timer = new TimerService();
    const now = 2_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const sim = baseSim({ startedAt: now - 300_000, durationSeconds: 600 });
    expect(timer.remainingFraction(sim)).toBeCloseTo(0.5, 2);
    vi.restoreAllMocks();
  });
});
