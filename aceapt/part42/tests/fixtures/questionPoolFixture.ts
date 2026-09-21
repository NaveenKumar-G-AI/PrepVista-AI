import type { DiagnosticQuestion, QuestionDifficulty } from "../../src/types/domain.js";

let counter = 0;
function nextId(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}`;
}

const DIFFICULTIES: QuestionDifficulty[] = ["easy", "medium", "hard", "very_hard"];
const EXPECTED_TIME_MS: Record<QuestionDifficulty, number> = { easy: 20000, medium: 35000, hard: 55000, very_hard: 80000 };

export function makeQuestionPool(skillNodeId: string, countPerDifficulty = 10): DiagnosticQuestion[] {
  const questions: DiagnosticQuestion[] = [];
  for (const difficulty of DIFFICULTIES) {
    for (let i = 0; i < countPerDifficulty; i++) {
      questions.push({
        id: nextId(`q-${skillNodeId}-${difficulty}`),
        domain: "quant",
        topic: "arithmetic",
        subtopic: "percentage",
        skillNodeId,
        difficulty,
        expectedTimeMs: EXPECTED_TIME_MS[difficulty],
        questionType: "mcq",
        qualityStatus: "active",
      });
    }
  }
  return questions;
}
