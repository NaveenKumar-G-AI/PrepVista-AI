import type { QuestionDifficulty, RawResponseInput } from "../../src/types/domain.js";
import { computeEvidence } from "../../src/engine/evidenceQuality.js";
import { buildStudentProfile, type ProfileResponsePoint } from "../../src/engine/studentProfileBuilder.js";
import type { Blueprint } from "../../src/types/domain.js";

let seq = 0;

export interface SyntheticResponse {
  input: RawResponseInput;
  priorExposureCount: number;
}

function response(
  skillNodeId: string,
  difficulty: QuestionDifficulty,
  opts: {
    isCorrect: boolean | null;
    expectedDurationMs: number;
    actualDurationMs: number;
    confidence?: 1 | 2 | 3 | 4 | 5;
    hintUsed?: boolean;
    priorExposureCount?: number;
  },
): SyntheticResponse {
  seq += 1;
  const startedAt = new Date(2026, 0, 1, 0, 0, seq).toISOString();
  const completedAt = new Date(new Date(startedAt).getTime() + opts.actualDurationMs).toISOString();
  return {
    priorExposureCount: opts.priorExposureCount ?? 0,
    input: {
      clientResponseId: `resp-${skillNodeId}-${seq}`,
      questionId: `q-${skillNodeId}-${seq}`,
      skillNodeId,
      answer: opts.isCorrect === null ? null : "A",
      isCorrect: opts.isCorrect,
      questionDifficulty: difficulty,
      expectedDurationMs: opts.expectedDurationMs,
      startedAt,
      completedAt,
      durationMs: opts.actualDurationMs,
      confidence: opts.confidence,
      hintUsed: opts.hintUsed ?? false,
      attemptNumber: 1,
      wasPreviouslyExposed: (opts.priorExposureCount ?? 0) > 0,
    },
  };
}

/** Runs synthetic responses through the REAL evidenceQuality + profile
 * builder pipeline — nothing here hand-sets an evidence weight or a
 * confidence label. This is the same code path the live API uses. */
export function runThroughRealPipeline(blueprint: Blueprint, sessionId: string, studentId: string, responses: SyntheticResponse[]) {
  const profileResponses: ProfileResponsePoint[] = responses.map(({ input, priorExposureCount }) => {
    const evidence = computeEvidence({ response: input, priorExposureCount });
    return {
      skillNodeId: input.skillNodeId,
      isCorrect: evidence.isCorrect,
      durationMs: input.durationMs,
      expectedDurationMs: input.expectedDurationMs,
      difficulty: input.questionDifficulty,
      confidence: input.confidence,
      evidenceWeight: evidence.evidenceWeight,
      createdAt: input.startedAt,
    };
  });

  return buildStudentProfile({ sessionId, studentId, blueprint, responses: profileResponses });
}

const EXPECTED = { easy: 20000, medium: 35000, hard: 55000, very_hard: 80000 } as const;

function repeat<T>(n: number, fn: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

/** Student A — strong across all domains. */
export function studentA_strongAcrossAllDomains(skillIds: string[]): SyntheticResponse[] {
  return skillIds.flatMap((skillId) =>
    repeat(10, (i) =>
      response(skillId, "medium", {
        isCorrect: i % 10 !== 0, // ~90%
        expectedDurationMs: EXPECTED.medium,
        actualDurationMs: EXPECTED.medium * 0.9,
        confidence: 4,
      }),
    ),
  );
}

/** Student B — weak across all domains. */
export function studentB_weakAcrossAllDomains(skillIds: string[]): SyntheticResponse[] {
  return skillIds.flatMap((skillId) =>
    repeat(10, (i) =>
      response(skillId, "medium", {
        isCorrect: i % 4 === 0, // ~25%
        expectedDurationMs: EXPECTED.medium,
        actualDurationMs: EXPECTED.medium * 1.3,
        confidence: 2,
      }),
    ),
  );
}

/** Student C — fast but inaccurate: FAST + WRONG should dominate. */
export function studentC_fastButInaccurate(skillId: string): SyntheticResponse[] {
  return repeat(12, (i) =>
    response(skillId, "medium", {
      isCorrect: i % 3 === 0, // ~33%
      expectedDurationMs: EXPECTED.medium,
      actualDurationMs: EXPECTED.medium * 0.4, // well under expected
      confidence: 3,
    }),
  );
}

/** Student D — slow but accurate: SLOW + CORRECT should dominate. */
export function studentD_slowButAccurate(skillId: string): SyntheticResponse[] {
  return repeat(12, (i) =>
    response(skillId, "medium", {
      isCorrect: i % 6 !== 0, // ~83%
      expectedDurationMs: EXPECTED.medium,
      actualDurationMs: EXPECTED.medium * 1.8, // well above expected
      confidence: 3,
    }),
  );
}

/** Student E — high confidence but frequently wrong: overconfidence. */
export function studentE_highConfidenceFrequentlyWrong(skillId: string): SyntheticResponse[] {
  return repeat(10, (i) =>
    response(skillId, "medium", {
      isCorrect: i % 4 === 0, // ~25% correct
      expectedDurationMs: EXPECTED.medium,
      actualDurationMs: EXPECTED.medium,
      confidence: 5,
    }),
  );
}

/** Student F — low confidence but frequently correct: underconfidence. */
export function studentF_lowConfidenceFrequentlyCorrect(skillId: string): SyntheticResponse[] {
  return repeat(10, (i) =>
    response(skillId, "medium", {
      isCorrect: i % 5 !== 0, // ~80% correct
      expectedDurationMs: EXPECTED.medium,
      actualDurationMs: EXPECTED.medium,
      confidence: 1,
    }),
  );
}

/** Student G — highly inconsistent: alternating strong/weak blocks, not a flat 60%. */
export function studentG_highlyInconsistent(skillId: string): SyntheticResponse[] {
  const pattern = [true, true, true, false, false, false, true, true, true, false, false];
  return pattern.map((isCorrect, i) =>
    response(skillId, "medium", {
      isCorrect,
      expectedDurationMs: EXPECTED.medium,
      actualDurationMs: EXPECTED.medium,
      confidence: 3,
    }),
  );
}

/** Student H — strong foundation, weak advanced application: a real difficulty boundary. */
export function studentH_strongFoundationWeakAdvanced(skillId: string): SyntheticResponse[] {
  const easy = repeat(4, () => response(skillId, "easy", { isCorrect: true, expectedDurationMs: EXPECTED.easy, actualDurationMs: EXPECTED.easy * 0.9, confidence: 4 }));
  const medium = repeat(4, (i) => response(skillId, "medium", { isCorrect: i !== 0, expectedDurationMs: EXPECTED.medium, actualDurationMs: EXPECTED.medium, confidence: 4 }));
  const hard = repeat(4, (i) => response(skillId, "hard", { isCorrect: i === 0, expectedDurationMs: EXPECTED.hard, actualDurationMs: EXPECTED.hard * 1.2, confidence: 2 }));
  return [...easy, ...medium, ...hard];
}

/** Student I — strong on familiar (previously exposed) questions, weak on novel ones. */
export function studentI_strongFamiliarWeakNovel(skillId: string): SyntheticResponse[] {
  const familiar = repeat(6, () =>
    response(skillId, "medium", { isCorrect: true, expectedDurationMs: EXPECTED.medium, actualDurationMs: EXPECTED.medium * 0.8, confidence: 5, priorExposureCount: 2 }),
  );
  const novel = repeat(6, (i) =>
    response(skillId, "medium", { isCorrect: i % 4 === 0, expectedDurationMs: EXPECTED.medium, actualDurationMs: EXPECTED.medium, confidence: 3, priorExposureCount: 0 }),
  );
  return [...familiar, ...novel];
}
