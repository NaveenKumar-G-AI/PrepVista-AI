import type { NoveltyLevel, ContextType, QuestionChoice } from "../../types/index.js";

export interface EquivalentQuestionRequest {
  skillName: string;
  skillKey: string;
  noveltyLevel: NoveltyLevel;
  contextType: ContextType;
  difficultyTarget: number;
  /** An existing approved question for this skill, used as a topical anchor
   *  so the generated item tests the same underlying reasoning rather than
   *  drifting to an unrelated skill. */
  referencePrompt?: string;
  /** Existing prompts to steer clear of near-duplicating (best-effort - the
   *  quality pipeline's duplicate check is the real gate, this is just a hint). */
  avoidPrompts: string[];
}

export interface GeneratedQuestionCandidate {
  prompt: string;
  choices: QuestionChoice[];
  correctChoiceId: string;
  explanation: string;
  reportedSkillTag: string;
  reportedDifficulty: number;
  expectedTimeSeconds: number;
}

export interface MasterySummaryRequest {
  skillName: string;
  state: string;
  rationale: string[];
}

export interface AIProvider {
  readonly name: string;
  generateEquivalentQuestion(req: EquivalentQuestionRequest): Promise<GeneratedQuestionCandidate>;
  generateMasterySummary(req: MasterySummaryRequest): Promise<string>;
}

/** Thrown by any provider when generation isn't currently possible (no key
 *  configured, upstream failure, etc). Callers MUST catch this and fall back
 *  to the seeded question pool - never invent a question locally as if it
 *  came from the AI path (spec section 53: "never silently create false
 *  mastery evidence" extends to never silently faking a generation step). */
export class AIGenerationUnavailableError extends Error {}
