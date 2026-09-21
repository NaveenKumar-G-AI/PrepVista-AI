import type { QuestionAttempt, SimulationRecord } from "../../domain/types.js";

let counter = 0;

export function makeAttempt(overrides: Partial<QuestionAttempt> = {}): QuestionAttempt {
  counter += 1;
  return {
    questionId: `q-${counter}`,
    topicId: "topic-a",
    topicName: "Topic A",
    difficulty: "medium",
    section: "Section 1",
    sequencePosition: counter,
    selectedOptionId: "a",
    isCorrect: true,
    timeSpentSeconds: 60,
    expectedTimeSeconds: 60,
    skipCount: 0,
    revisitCount: 0,
    finalStatus: "answered",
    ...overrides,
  };
}

export function makeSimulation(overrides: Partial<SimulationRecord> = {}): SimulationRecord {
  counter += 1;
  return {
    id: `sim-${counter}`,
    studentId: "student-1",
    profileId: "profile-1",
    practiceMode: "realistic_simulation",
    status: "submitted",
    startedAt: "2026-01-01T09:00:00.000Z",
    submittedAt: "2026-01-01T09:45:00.000Z",
    durationMinutes: 45,
    totalScore: null,
    maxScore: null,
    accuracy: null,
    attempts: [],
    createdAt: "2026-01-01T09:45:00.000Z",
    ...overrides,
  };
}

/** A run of `n` sequential attempts, alternating correct/incorrect according
 * to `correctPattern` (cycled), useful for building degradation/recovery
 * fixtures quickly. */
export function makeAttemptRun(
  n: number,
  correctPattern: boolean[],
  overrides: (i: number) => Partial<QuestionAttempt> = () => ({})
): QuestionAttempt[] {
  return Array.from({ length: n }, (_, i) =>
    makeAttempt({
      sequencePosition: i + 1,
      isCorrect: correctPattern[i % correctPattern.length],
      ...overrides(i),
    })
  );
}
