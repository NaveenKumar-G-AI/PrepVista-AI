import { StudentState } from '../domain/types';

const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();

/**
 * student_102 reproduces the spec's own Section 72 demo story exactly, from
 * raw attempt data rather than hard-coded outputs: strong untimed Probability
 * (avg 88%), weak timed/simulation Probability (avg 59%), strong persistence.
 * Feed this through the real pipeline and it should independently arrive at
 * SPEED_GAP -> TIMED_DRILL with baseline 59% — nothing about that outcome is
 * hard-coded in the engine itself.
 *
 * student_205 is a deliberate counterexample: weak accuracy in BOTH modes
 * plus heavy hint use in Percentages. Same subject, same rough score range
 * as some of student_102's attempts, completely different problem and
 * intervention — this is the "SAME SCORE != SAME INTERVENTION" principle
 * (Section: Student Problem Analysis) demonstrated with real evidence rather
 * than asserted in prose.
 */
export const SEED_STUDENTS: StudentState[] = [
  {
    studentId: 'student_102',
    generatedAt: new Date(now).toISOString(),
    recentPerformance: [
      { topic: 'Probability', mode: 'untimed', accuracyPct: 90, questionCount: 12, attemptedAt: daysAgo(9) },
      { topic: 'Probability', mode: 'untimed', accuracyPct: 86, questionCount: 10, attemptedAt: daysAgo(6) },
      { topic: 'Probability', mode: 'untimed', accuracyPct: 88, questionCount: 10, attemptedAt: daysAgo(3) },
      { topic: 'Probability', mode: 'simulation', accuracyPct: 61, questionCount: 10, attemptedAt: daysAgo(5) },
      { topic: 'Probability', mode: 'simulation', accuracyPct: 57, questionCount: 10, attemptedAt: daysAgo(2) },
      { topic: 'Percentages', mode: 'untimed', accuracyPct: 78, questionCount: 10, attemptedAt: daysAgo(8) },
      { topic: 'Percentages', mode: 'timed', accuracyPct: 74, questionCount: 10, attemptedAt: daysAgo(4) }
    ],
    behaviorProfile: [
      { code: 'STRONG_PERSISTENCE', detail: 'Completes drills even after an initial wrong streak.' },
      { code: 'HIGH_CONSISTENCY', detail: 'Studied on most planned days over the last two weeks.' }
    ],
    persistence: 'high',
    consistency: 0.8,
    availableStudyMinutes: 20,
    assessmentDeadline: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
    readiness: 62,
    interventionHistory: [],
    retentionSignals: 'unavailable',
    transferSignals: 'unavailable'
  },
  {
    studentId: 'student_205',
    generatedAt: new Date(now).toISOString(),
    recentPerformance: [
      { topic: 'Percentages', mode: 'untimed', accuracyPct: 48, questionCount: 10, attemptedAt: daysAgo(7), hintsUsed: 4 },
      { topic: 'Percentages', mode: 'untimed', accuracyPct: 52, questionCount: 10, attemptedAt: daysAgo(4), hintsUsed: 3 },
      { topic: 'Percentages', mode: 'timed', accuracyPct: 45, questionCount: 10, attemptedAt: daysAgo(2), hintsUsed: 2 },
      { topic: 'Data Interpretation', mode: 'untimed', accuracyPct: 80, questionCount: 10, attemptedAt: daysAgo(6) },
      { topic: 'Data Interpretation', mode: 'timed', accuracyPct: 77, questionCount: 10, attemptedAt: daysAgo(3) }
    ],
    behaviorProfile: [{ code: 'LOW_CONSISTENCY', detail: 'Skipped 4 of the last 10 planned sessions.' }],
    persistence: 'medium',
    consistency: 0.45,
    availableStudyMinutes: 12,
    assessmentDeadline: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString(),
    readiness: 48,
    interventionHistory: [],
    retentionSignals: 'unavailable',
    transferSignals: 'unavailable'
  }
];
