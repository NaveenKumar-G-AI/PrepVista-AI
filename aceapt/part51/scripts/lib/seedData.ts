import { withStudentContext, withServiceContext } from "../../src/db/pool.js";
import { createStudent, createSkill, createQuestion } from "../../src/db/repositories/fixtureRepo.js";
import * as sessionRepo from "../../src/db/repositories/sessionRepo.js";
import * as attemptRepo from "../../src/db/repositories/attemptRepo.js";
import type { ErrorType } from "../../src/types/errorTaxonomy.js";
import type { Difficulty, HintLevel } from "../../src/types/training.js";

export interface SeededSkill {
  skillId: string;
  questionIds: string[];
}

export interface SeedResult {
  studentId: string;
  skills: { probability: SeededSkill; percentages: SeededSkill; ratio: SeededSkill };
  liveSessionQuestionIds: string[]; // fresh, unused-in-history questions for the walkthrough's live session
  expected: {
    probability: { guidedAccuracy: number; independentAccuracy: number; overallAccuracy: number };
    percentages: { accuracy: number };
    ratio: { accuracy: number };
    overallAccuracy: number;
  };
}

let counter = 0;
function nextTag(): string {
  counter++;
  return `${Date.now().toString(36)}-${counter}`;
}

/**
 * Builds one deterministic history: 50 guided + 20 independent Probability
 * attempts (94.0% / 70.0%), 60 Percentages attempts (95.0%), 40 Ratio
 * attempts (90.0%) — every percentage below is exact arithmetic on these
 * counts, computed here and re-asserted against the live API in
 * live-walkthrough.ts, not just read off whatever the server happens to
 * return.
 */
export async function seedDemoStudent(): Promise<SeedResult> {
  const tag = nextTag();
  const studentId = await withServiceContext((client) => createStudent(client, `Demo Student ${tag}`));

  const probabilitySkillId = await withServiceContext((client) => createSkill(client, "Probability", "Quant"));
  const percentagesSkillId = await withServiceContext((client) => createSkill(client, "Percentages", "Quant"));
  const ratioSkillId = await withServiceContext((client) => createSkill(client, "Ratio", "Quant"));

  const makeQuestions = (skillId: string, n: number, difficulty: Difficulty) =>
    withServiceContext(async (client) => {
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        ids.push(
          await createQuestion(client, {
            skillId,
            difficulty,
            prompt: `Auto-generated ${difficulty} question ${i + 1} for seed ${tag}`,
            correctAnswer: { value: 42 },
            isValid: true,
            steps: null
          })
        );
      }
      return ids;
    });

  const probabilityQuestionIds = await makeQuestions(probabilitySkillId, 12, "medium");
  const percentagesQuestionIds = await makeQuestions(percentagesSkillId, 8, "medium");
  const ratioQuestionIds = await makeQuestions(ratioSkillId, 8, "medium");
  const liveSessionQuestionIds = await makeQuestions(probabilitySkillId, 4, "medium");

  // One holding session per skill for historical attempts (FK requires a session_id).
  const historySessionId = await withStudentContext(studentId, async (client) => {
    const s = await sessionRepo.createSession(client, {
      studentId,
      trainingType: "MIXED_PRECISION",
      targetSkillId: null,
      targetErrorType: null,
      difficulty: "medium",
      mode: "guided",
      questionPlan: []
    });
    await sessionRepo.updateSessionState(client, s.id, { status: "ACTIVE" });
    return s.id;
  });

  let seq = 0;
  async function record(
    skillId: string,
    questionIds: string[],
    isCorrect: boolean,
    hintLevel: HintLevel,
    errorType: ErrorType | null,
    minutesAgo: number
  ) {
    seq++;
    await withStudentContext(studentId, (client) =>
      attemptRepo.insertAttemptIfAbsent(client, {
        sessionId: historySessionId,
        studentId,
        questionId: questionIds[seq % questionIds.length]!,
        skillId,
        sequenceNumber: seq,
        submittedAnswer: { value: isCorrect ? 42 : 0 },
        isCorrect,
        firstErrorStep: null,
        stepResults: null,
        errorType: isCorrect ? null : errorType,
        difficulty: "medium",
        isNovel: false,
        hintLevel,
        responseTimeMs: null,
        expectedTimeMs: null,
        selfCorrected: false,
        questionValid: true,
        sessionPositionPct: 50
      })
    );
    // createdAt defaults to now(); minutesAgo is accepted for readability at
    // call sites even though this seed doesn't backdate rows — ordering by
    // insertion order already gives correct chronology for every domain
    // function that relies on it.
    void minutesAgo;
  }

  // Probability: 50 guided (47 correct: wrong at positions 25 CALC, 45 & 48 STRATEGY),
  // 20 independent (14 correct: wrong at positions 0 STRATEGY, 1 CALC, 5 STRATEGY,
  // 10 STRATEGY, 18 STRATEGY, 19 STRATEGY). Errors are spread across the history with
  // one right at the end, rather than clustered at the start — bunching every miss at
  // the start followed by a long correct streak is indistinguishable, by the spec's own
  // §53 rule, from a genuinely RESOLVED pattern. An earlier version of this seed did
  // exactly that and the live walkthrough correctly reported the error as resolved
  // rather than recurring — the domain logic was right and the synthetic data was
  // wrong. This layout keeps recent evidence of the error present, matching the
  // "ongoing, recurring bottleneck" scenario the walkthrough is meant to exercise.
  const guidedWrong = new Map<number, ErrorType>([
    [25, "CALCULATION_ERROR"],
    [45, "STRATEGY_ERROR"],
    [48, "STRATEGY_ERROR"]
  ]);
  for (let i = 0; i < 50; i++) {
    const errorType = guidedWrong.get(i) ?? null;
    await record(probabilitySkillId, probabilityQuestionIds, errorType === null, "guided", errorType, 5000 - i);
  }
  const independentWrong = new Map<number, ErrorType>([
    [0, "STRATEGY_ERROR"],
    [1, "CALCULATION_ERROR"],
    [5, "STRATEGY_ERROR"],
    [10, "STRATEGY_ERROR"],
    [18, "STRATEGY_ERROR"],
    [19, "STRATEGY_ERROR"]
  ]);
  for (let i = 0; i < 20; i++) {
    const errorType = independentWrong.get(i) ?? null;
    await record(probabilitySkillId, probabilityQuestionIds, errorType === null, "independent", errorType, 2000 - i);
  }

  // Percentages: 60 attempts, 57 correct (95.0%).
  for (let i = 0; i < 60; i++) {
    const isCorrect = i >= 3;
    await record(percentagesSkillId, percentagesQuestionIds, isCorrect, "guided", isCorrect ? null : "CALCULATION_ERROR", 1000 - i);
  }

  // Ratio: 40 attempts, 36 correct (90.0%).
  for (let i = 0; i < 40; i++) {
    const isCorrect = i >= 4;
    await record(ratioSkillId, ratioQuestionIds, isCorrect, "guided", isCorrect ? null : "INPUT_MAPPING_ERROR", 500 - i);
  }

  const probGuidedAcc = (50 - 3) / 50; // 0.94
  const probIndepAcc = (20 - 6) / 20; // 0.70
  const probOverall = (47 + 14) / (50 + 20); // 61/70
  const pctAcc = 57 / 60;
  const ratioAcc = 36 / 40;
  const totalAttempts = 50 + 20 + 60 + 40;
  const totalCorrect = 47 + 14 + 57 + 36;

  return {
    studentId,
    skills: {
      probability: { skillId: probabilitySkillId, questionIds: probabilityQuestionIds },
      percentages: { skillId: percentagesSkillId, questionIds: percentagesQuestionIds },
      ratio: { skillId: ratioSkillId, questionIds: ratioQuestionIds }
    },
    liveSessionQuestionIds,
    expected: {
      probability: {
        guidedAccuracy: round1(probGuidedAcc * 100),
        independentAccuracy: round1(probIndepAcc * 100),
        overallAccuracy: round1(probOverall * 100)
      },
      percentages: { accuracy: round1(pctAcc * 100) },
      ratio: { accuracy: round1(ratioAcc * 100) },
      overallAccuracy: round1((totalCorrect / totalAttempts) * 100)
    }
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
