/**
 * CodeForge — AI Provider Abstraction (§4, §44)
 *
 * AIProvider ├── GroqProvider ├── GeminiProvider └── NullProvider
 *
 * Nothing above this interface should ever import a vendor SDK or know a
 * vendor's request/response shape — that isolation is the entire point (§4:
 * "Do not hardcode the entire product around one AI API"). AI is used only
 * where §45 says it adds value (generation, coaching, qualitative read of a
 * submission) — never for compilation, test execution, or deterministic
 * scoring, which stay in src/execution and src/engine.
 */

import type { DifficultyLabel, MistakeCategory, RoleContext, SupportedLanguage, TaskType, TestCategory, TestResult } from "../domain/types.js";

export interface ChallengeDraftRequest {
  role: RoleContext;
  skill: string;
  subskill: string;
  difficultyLabel: DifficultyLabel;
  taskType: TaskType;
  language: SupportedLanguage;
  learningObjective: string;
  constraints: string[];
}

export interface DraftTestCase {
  category: TestCategory;
  input: unknown[];
  expectedOutput: unknown;
  hidden: boolean;
}

export interface ChallengeDraft {
  title: string;
  description: string;
  entryFunction: string;
  starterCode: string;
  referenceSolution: string;
  publicTests: DraftTestCase[];
  hiddenTests: DraftTestCase[];
  hints: string[];
}

export interface CoachingRequest {
  challengeTitle: string;
  challengeDescription: string;
  language: SupportedLanguage;
  studentCode: string;
  testResults: TestResult[];
  mistakeCategories: MistakeCategory[];
}

export interface CoachingResponse {
  codeQualityNote: string;
  /** A guiding nudge, not a solution — see §30. */
  coachingMessage: string;
  likelyMisconception?: string;
}

/**
 * Thrown by adapters on any failure (missing key, network error, malformed
 * response, timeout). The resilience wrapper in providers.ts is the only
 * thing that should catch this — individual adapters should not swallow
 * errors, or the fallback chain in §44 has nothing to fall back from.
 */
export class AIProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "AIProviderError";
  }
}

export interface AIProvider {
  readonly name: string;
  draftChallenge(req: ChallengeDraftRequest): Promise<ChallengeDraft>;
  coachOnAttempt(req: CoachingRequest): Promise<CoachingResponse>;
}
