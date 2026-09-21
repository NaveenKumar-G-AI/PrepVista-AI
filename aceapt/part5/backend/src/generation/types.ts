import { Difficulty, DifficultyDimension, QuestionType } from "../domain/enums";
import { Question, Skill } from "../domain/types";

/** §32 step 1 — a question specification, never a bare "give me a question" prompt. */
export interface QuestionSpecification {
  skill: Skill;
  targetDifficulty: Difficulty;
  focusDimension?: DifficultyDimension;
  questionType: QuestionType;
  avoidTemplateIds: string[];
  reason: string;
}

export interface GenerationResult {
  question: Question | null;
  providerUsed: "template" | "anthropic";
  error?: string;
}

export interface QuestionProvider {
  readonly name: "template" | "anthropic";
  isAvailable(): boolean;
  generate(spec: QuestionSpecification): Promise<GenerationResult>;
}
