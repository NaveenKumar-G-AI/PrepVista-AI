import { computeSafeSpeedZone, computeSpeedAccuracyFrontier, FrontierPoint } from '../src/core/speedAccuracyFrontier';
import { NewSpeedAttempt, SpeedAttemptRecord, SpeedPerformanceState } from '../src/types/domain';

let counter = 0;
function makeAttempt(responseTimeMs: number, correct: boolean, overrides: Partial<SpeedAttemptRecord> = {}): SpeedAttemptRecord {
  counter += 1;
  const base: NewSpeedAttempt = {
    sessionId: 's1',
    studentId: 'student-1',
    question: { questionId: `q${counter}`, skillId: 'percentages', difficulty: 'MEDIUM' },
    responseTimeMs,
    correct,
    independent: true,
    hintLevel: 0,
    clientAttemptId: `client-${counter}`,
  };
  return {
    ...base,
    id: `attempt-${counter}`,
    expectedTimeMs: null,
    expectedTimeSource: 'UNKNOWN',
    relativeSpeed: null,
    performanceState: SpeedPerformanceState.INSUFFICIENT_DATA,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('computeSpeedAccuracyFrontier (spec 110)', () => {
  it('returns [] rather than a guessed shape when there is not enough evidence', () => {
    const attempts = Array.from({ length: 5 }, (_, i) => makeAttempt(40000 + i * 1000, true));
    expect(computeSpeedAccuracyFrontier(attempts)).toEqual([]);
  });

  it('buckets attempts by time and reports accuracy per bucket, using only independent attempts', () => {
    const veryFastCareless = Array.from({ length: 6 }, (_, i) => makeAttempt(20000 + i * 200, i % 3 !== 0)); // ~67% accurate
    const midSafe = Array.from({ length: 6 }, (_, i) => makeAttempt(50000 + i * 200, true)); // 100% accurate
    const slowFine = Array.from({ length: 6 }, (_, i) => makeAttempt(90000 + i * 200, i % 4 !== 0)); // 75% accurate
    const assisted = Array.from({ length: 4 }, (_, i) => makeAttempt(15000 + i * 100, true, { independent: false, hintLevel: 2 }));

    const frontier = computeSpeedAccuracyFrontier([...veryFastCareless, ...midSafe, ...slowFine, ...assisted], 3);

    expect(frontier.length).toBeGreaterThanOrEqual(2);
    const totalBucketed = frontier.reduce((sum, p) => sum + p.sampleSize, 0);
    // Hint-assisted attempts must never be counted into the frontier.
    expect(totalBucketed).toBe(18);
    // Buckets are ordered by increasing time.
    for (let i = 1; i < frontier.length; i += 1) {
      expect(frontier[i].avgTimeMs).toBeGreaterThan(frontier[i - 1].avgTimeMs);
    }
  });
});

describe('computeSafeSpeedZone (spec 111)', () => {
  const guardrail = 0.85;

  it('returns null when no contiguous run of buckets meets the guardrail', () => {
    const frontier: FrontierPoint[] = [
      { avgTimeMs: 20000, accuracy: 0.5, sampleSize: 5 },
      { avgTimeMs: 50000, accuracy: 0.6, sampleSize: 5 },
      { avgTimeMs: 90000, accuracy: 0.7, sampleSize: 5 },
    ];
    expect(computeSafeSpeedZone(frontier, guardrail)).toBeNull();
  });

  it('identifies the widest contiguous safe range - e.g. "42-55 sec" from the spec\'s own example', () => {
    const frontier: FrontierPoint[] = [
      { avgTimeMs: 20000, accuracy: 0.6, sampleSize: 5 }, // too fast, careless
      { avgTimeMs: 42000, accuracy: 0.9, sampleSize: 5 }, // safe zone starts
      { avgTimeMs: 48000, accuracy: 0.95, sampleSize: 5 },
      { avgTimeMs: 55000, accuracy: 0.88, sampleSize: 5 }, // safe zone ends
      { avgTimeMs: 90000, accuracy: 0.7, sampleSize: 5 }, // slow, but accuracy has actually fallen (hesitation/attention issue)
    ];
    const zone = computeSafeSpeedZone(frontier, guardrail);
    expect(zone).toEqual({ minMs: 42000, maxMs: 55000, guardrail });
  });

  it('picks the WIDEST contiguous run when there are multiple safe pockets', () => {
    const frontier: FrontierPoint[] = [
      { avgTimeMs: 20000, accuracy: 0.9, sampleSize: 5 }, // isolated safe pocket (length 1)
      { avgTimeMs: 30000, accuracy: 0.5, sampleSize: 5 },
      { avgTimeMs: 45000, accuracy: 0.9, sampleSize: 5 }, // wider safe run (length 3)
      { avgTimeMs: 50000, accuracy: 0.92, sampleSize: 5 },
      { avgTimeMs: 55000, accuracy: 0.88, sampleSize: 5 },
    ];
    const zone = computeSafeSpeedZone(frontier, guardrail);
    expect(zone).toEqual({ minMs: 45000, maxMs: 55000, guardrail });
  });
});
