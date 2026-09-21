import { Difficulty, DifficultyDimension, PracticeObjective, QuestionType } from "../domain/enums";
import { Question } from "../domain/types";
import { ExposureRow } from "../repositories/questionRepository";
import { noveltyPenalty, needsVariation } from "./antiMemorization";

export interface SelectionContext {
  targetDifficulty: Difficulty;
  focusDimension?: DifficultyDimension;
  objective: PracticeObjective;
  preferredQuestionTypes?: QuestionType[];
  suspectedMemorization: boolean;
  recentSkillIds: string[]; // skills served in the last few questions this session, for diversity in mixed practice
  recentSubtopics: string[];
}

export interface ScoredCandidate {
  question: Question;
  score: number;
  breakdown: { factor: string; weight: number; contribution: number }[];
}

/** Objective → preferred question types (§7 driving §16). */
const OBJECTIVE_TYPE_PREFERENCE: Partial<Record<PracticeObjective, QuestionType[]>> = {
  [PracticeObjective.BUILD_FOUNDATION]: [QuestionType.CONCEPT_CHECK, QuestionType.GUIDED_PRACTICE],
  [PracticeObjective.REPAIR_GAP]: [QuestionType.CONCEPT_CHECK, QuestionType.GUIDED_PRACTICE, QuestionType.STANDARD_PRACTICE],
  [PracticeObjective.IMPROVE_ACCURACY]: [QuestionType.STANDARD_PRACTICE, QuestionType.ACCURACY],
  [PracticeObjective.IMPROVE_SPEED]: [QuestionType.SPEED, QuestionType.STANDARD_PRACTICE],
  [PracticeObjective.VERIFY_MASTERY]: [QuestionType.STANDARD_PRACTICE, QuestionType.APPLICATION, QuestionType.TRANSFER, QuestionType.EXAM_STYLE],
  [PracticeObjective.TRANSFER_SKILL]: [QuestionType.TRANSFER, QuestionType.APPLICATION],
  [PracticeObjective.PREPARE_FOR_EXAM]: [QuestionType.EXAM_STYLE, QuestionType.MIXED, QuestionType.CHALLENGE],
  [PracticeObjective.MAINTAIN_SKILL]: [QuestionType.MIXED, QuestionType.STANDARD_PRACTICE],
};

/**
 * Scores and ranks candidate questions (§15). Returns NEXT_BEST_QUESTION,
 * not a random pick, and always returns the score breakdown so callers can
 * show/log *why* a question was chosen instead of it being opaque.
 */
export function selectNextQuestion(
  candidates: Question[],
  exposureByQuestionId: Map<string, ExposureRow>,
  ctx: SelectionContext
): ScoredCandidate | null {
  if (candidates.length === 0) return null;

  const scored = candidates.map((q) => scoreQuestion(q, exposureByQuestionId.get(q.id), ctx));
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

export function rankCandidates(
  candidates: Question[],
  exposureByQuestionId: Map<string, ExposureRow>,
  ctx: SelectionContext
): ScoredCandidate[] {
  return candidates
    .map((q) => scoreQuestion(q, exposureByQuestionId.get(q.id), ctx))
    .sort((a, b) => b.score - a.score);
}

function scoreQuestion(question: Question, exposure: ExposureRow | undefined, ctx: SelectionContext): ScoredCandidate {
  const breakdown: ScoredCandidate["breakdown"] = [];
  let score = 0;

  // 1. Difficulty match — closer to target scores higher, gaussian-ish falloff.
  const distance = Math.abs(question.difficulty.level - ctx.targetDifficulty);
  const difficultyScore = Math.max(0, 10 - distance * distance);
  score += difficultyScore;
  breakdown.push({ factor: "difficulty_match", weight: 1, contribution: difficultyScore });

  // 2. Focus dimension alignment (e.g. calculation-heavy after a calc-error adaptation).
  if (ctx.focusDimension) {
    const dimValue = dimensionValue(question, ctx.focusDimension);
    const focusScore = dimValue * 2; // dimension is 1-5, so up to +10
    score += focusScore;
    breakdown.push({ factor: `focus_${ctx.focusDimension.toLowerCase()}`, weight: 2, contribution: focusScore });
  }

  // 3. Objective → question type alignment.
  const preferredTypes = ctx.preferredQuestionTypes ?? OBJECTIVE_TYPE_PREFERENCE[ctx.objective] ?? [];
  if (preferredTypes.includes(question.questionType)) {
    score += 8;
    breakdown.push({ factor: "objective_type_match", weight: 1, contribution: 8 });
  }

  // 4. Novelty / anti-memorization (§17, §18) — penalize repeats, more so if memorization is suspected.
  const penalty = noveltyPenalty(exposure) * (needsVariation(exposure, ctx.suspectedMemorization) ? 14 : 9);
  score -= penalty;
  breakdown.push({ factor: "novelty_penalty", weight: -1, contribution: -penalty });

  // 5. Diversity within the session — avoid back-to-back identical subtopics in mixed practice.
  if (ctx.recentSubtopics.length && ctx.recentSubtopics[ctx.recentSubtopics.length - 1] === question.subtopic) {
    score -= 4;
    breakdown.push({ factor: "subtopic_repetition_penalty", weight: -1, contribution: -4 });
  }

  // 6. Exam relevance, when set on the question.
  if (question.examRelevance) {
    const examScore = question.examRelevance * 3;
    score += examScore;
    breakdown.push({ factor: "exam_relevance", weight: 3, contribution: examScore });
  }

  // 7. Small deterministic tie-breaker so identical scores don't always resolve the same way,
  // without introducing true randomness into an "explainable" engine.
  const tiebreak = (hashString(question.id) % 100) / 1000;
  score += tiebreak;

  return { question, score, breakdown };
}

function dimensionValue(question: Question, dim: DifficultyDimension): number {
  switch (dim) {
    case DifficultyDimension.CONCEPT:
      return question.difficulty.conceptComplexity;
    case DifficultyDimension.REASONING:
      return question.difficulty.reasoningComplexity;
    case DifficultyDimension.CALCULATION:
      return question.difficulty.calculationComplexity;
    case DifficultyDimension.TIME_PRESSURE:
      return question.difficulty.timePressure;
    case DifficultyDimension.DISTRACTOR:
      return question.difficulty.distractorQuality;
    case DifficultyDimension.TRANSFER:
      return question.difficulty.transferDifficulty;
    default:
      return 3;
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
