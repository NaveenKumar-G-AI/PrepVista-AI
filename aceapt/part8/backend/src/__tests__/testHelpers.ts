import type { MasteryEvidence, EvidenceType, NoveltyLevel, ContextType, ExposureState } from "../types/index.js";

let counter = 0;

export function makeEvidence(overrides: Partial<MasteryEvidence> & { score: number; daysAgo?: number }): MasteryEvidence {
  counter++;
  const daysAgo = overrides.daysAgo ?? 0;
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: `ev_${counter}`,
    studentId: "stu_test",
    skillId: "skl_test",
    questionId: null,
    evidenceType: (overrides.evidenceType ?? "PRACTICE") as EvidenceType,
    score: overrides.score,
    difficulty: overrides.difficulty ?? 0.5,
    timed: overrides.timed ?? false,
    timeTakenSeconds: overrides.timeTakenSeconds ?? null,
    expectedTimeSeconds: overrides.expectedTimeSeconds ?? null,
    contextType: (overrides.contextType ?? "LABELED") as ContextType,
    noveltyLevel: (overrides.noveltyLevel ?? "FAMILIAR") as NoveltyLevel,
    questionExposureState: (overrides.questionExposureState ?? "SEEN") as ExposureState,
    source: overrides.source ?? "TEST",
    verificationAttemptId: overrides.verificationAttemptId ?? null,
    metadata: overrides.metadata ?? null,
    createdAt,
  };
}

/** Builds a chronological series where `daysAgo` counts down as items are
 *  listed oldest-first, matching what the repositories return. */
export function series(items: Array<Partial<MasteryEvidence> & { score: number }>): MasteryEvidence[] {
  const n = items.length;
  return items.map((item, i) => makeEvidence({ ...item, daysAgo: n - 1 - i }));
}
