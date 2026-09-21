/**
 * CodeForge — Challenge Generation Pipeline (§16, §17, §19)
 *
 * AI Draft → Schema Validation → Execution Validation → Test Quality
 * Validation → Adversarial Validation → REVIEW
 *
 * §17 is the whole point of this file: "AI must not certify its own answer."
 * The reference solution the AI wrote is executed for real, against every
 * test the AI wrote, using the same execution engine that scores students.
 * If it fails even one, the whole draft is rejected — no partial credit, no
 * "close enough." A second, independent check (§19, "adversarial
 * validation") tries a couple of deliberately-wrong mutant solutions against
 * the drafted tests and rejects the draft if a mutant also passes everything,
 * which catches tests too weak to discriminate a correct solution from a
 * broken one (something schema validation alone can't see).
 *
 * A draft that clears every stage lands in REVIEW, not ACTIVE (§37) — a
 * human still gates what reaches students; this pipeline's job is to make
 * sure nothing broken ever reaches that human.
 */

import {
  ChallengeLifecycleStatus,
  DifficultyLabel,
  ProgressionStage,
  SupportedLanguage,
  TestCategory,
  type Challenge,
  type DifficultyVector,
  type TestCase,
} from "../domain/types.js";
import type { AIProvider, ChallengeDraftRequest, ChallengeDraft } from "../ai/aiProvider.js";
import { runTestCase } from "../execution/executor.js";

export interface ValidationIssue {
  stage: "ai_draft" | "schema_validation" | "execution_validation" | "test_quality" | "adversarial_validation";
  message: string;
}

export type GenerationResult =
  | { status: "APPROVED"; challenge: Challenge; issues: [] }
  | { status: "REJECTED"; challenge: null; issues: ValidationIssue[] };

function defaultDifficultyVector(label: DifficultyLabel): DifficultyVector {
  const byLabel: Record<DifficultyLabel, DifficultyVector> = {
    [DifficultyLabel.FOUNDATION]: { conceptualComplexity: 1, implementationComplexity: 1, reasoningComplexity: 1, edgeCaseComplexity: 1, prerequisiteDepth: 1, expectedTimeMinutes: 8, calibrated: false },
    [DifficultyLabel.EASY]: { conceptualComplexity: 2, implementationComplexity: 2, reasoningComplexity: 1, edgeCaseComplexity: 2, prerequisiteDepth: 1, expectedTimeMinutes: 12, calibrated: false },
    [DifficultyLabel.INTERMEDIATE]: { conceptualComplexity: 3, implementationComplexity: 3, reasoningComplexity: 3, edgeCaseComplexity: 3, prerequisiteDepth: 2, expectedTimeMinutes: 18, calibrated: false },
    [DifficultyLabel.ADVANCED]: { conceptualComplexity: 4, implementationComplexity: 4, reasoningComplexity: 4, edgeCaseComplexity: 4, prerequisiteDepth: 3, expectedTimeMinutes: 25, calibrated: false },
    [DifficultyLabel.EXPERT]: { conceptualComplexity: 5, implementationComplexity: 5, reasoningComplexity: 5, edgeCaseComplexity: 5, prerequisiteDepth: 4, expectedTimeMinutes: 35, calibrated: false },
  };
  return byLabel[label];
}

function defaultProgressionStage(label: DifficultyLabel): ProgressionStage {
  const map: Record<DifficultyLabel, ProgressionStage> = {
    [DifficultyLabel.FOUNDATION]: ProgressionStage.FOUNDATION,
    [DifficultyLabel.EASY]: ProgressionStage.BASIC_APPLICATION,
    [DifficultyLabel.INTERMEDIATE]: ProgressionStage.INTERMEDIATE_APPLICATION,
    [DifficultyLabel.ADVANCED]: ProgressionStage.COMPLEX_COMBINATION,
    [DifficultyLabel.EXPERT]: ProgressionStage.REAL_WORLD_APPLICATION,
  };
  return map[label];
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

/** Deliberately-broken solutions used to check whether the drafted tests can actually catch a wrong answer. */
function buildMutants(entryFunction: string): { label: string; code: string }[] {
  const fn = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(entryFunction) ? entryFunction : "solution";
  return [
    { label: "always returns None", code: `def ${fn}(*args, **kwargs):\n    return None\n` },
    { label: "echoes its first argument unchanged", code: `def ${fn}(*args, **kwargs):\n    return args[0] if args else None\n` },
  ];
}

export async function generateChallenge(provider: AIProvider, req: ChallengeDraftRequest): Promise<GenerationResult> {
  // Stage 1 — AI draft
  let draft: ChallengeDraft;
  try {
    draft = await provider.draftChallenge(req);
  } catch (e) {
    return { status: "REJECTED", challenge: null, issues: [{ stage: "ai_draft", message: e instanceof Error ? e.message : String(e) }] };
  }

  // Stage 2 — schema validation
  const schemaIssues: ValidationIssue[] = [];
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(draft.entryFunction)) {
    schemaIssues.push({ stage: "schema_validation", message: `entryFunction '${draft.entryFunction}' is not a valid identifier` });
  }
  if (draft.publicTests.length < 2) schemaIssues.push({ stage: "schema_validation", message: "fewer than 2 public tests" });
  if (draft.hiddenTests.length < 2) schemaIssues.push({ stage: "schema_validation", message: "fewer than 2 hidden tests" });
  if (draft.hints.length < 3) schemaIssues.push({ stage: "schema_validation", message: "fewer than 3 hints" });
  if (!draft.referenceSolution.trim()) schemaIssues.push({ stage: "schema_validation", message: "referenceSolution is empty" });
  if (!draft.title.trim()) schemaIssues.push({ stage: "schema_validation", message: "title is empty" });
  if (schemaIssues.length > 0) return { status: "REJECTED", challenge: null, issues: schemaIssues };

  const allDraftTests: TestCase[] = [...draft.publicTests, ...draft.hiddenTests].map((t, i) => ({
    id: `draft-${i}`,
    category: t.category,
    input: t.input,
    expectedOutput: t.expectedOutput,
    hidden: t.hidden,
    points: 1,
  }));

  // Stage 3 — execution validation: the reference solution must pass EVERY test it shipped with.
  const executionIssues: ValidationIssue[] = [];
  for (const tc of allDraftTests) {
    const { result } = runTestCase(SupportedLanguage.PYTHON, draft.referenceSolution, draft.entryFunction, "exact", tc);
    if (!result.passed) {
      executionIssues.push({
        stage: "execution_validation",
        message: `reference solution failed its own ${tc.category} test ${tc.id}: ${result.errorMessage ?? "output did not match expectedOutput"}`,
      });
    }
  }
  if (executionIssues.length > 0) return { status: "REJECTED", challenge: null, issues: executionIssues };

  // Stage 4 — test quality: reject degenerate test sets schema validation can't see.
  const qualityIssues: ValidationIssue[] = [];
  const distinctOutputs = new Set(allDraftTests.map((t) => JSON.stringify(t.expectedOutput)));
  if (distinctOutputs.size === 1 && allDraftTests.length > 1) {
    qualityIssues.push({ stage: "test_quality", message: "every test expects the same output — cannot discriminate a correct solution from a broken one" });
  }
  if (!allDraftTests.some((t) => t.category === TestCategory.NORMAL)) {
    qualityIssues.push({ stage: "test_quality", message: "no NORMAL-category test present" });
  }
  if (qualityIssues.length > 0) return { status: "REJECTED", challenge: null, issues: qualityIssues };

  // Stage 5 — adversarial validation (§19): a solution that's obviously wrong must NOT also pass.
  const adversarialIssues: ValidationIssue[] = [];
  for (const mutant of buildMutants(draft.entryFunction)) {
    const mutantResults = allDraftTests.map((tc) => runTestCase(SupportedLanguage.PYTHON, mutant.code, draft.entryFunction, "exact", tc).result);
    if (mutantResults.every((r) => r.passed)) {
      adversarialIssues.push({ stage: "adversarial_validation", message: `a deliberately broken solution (${mutant.label}) passed every test — the tests are too weak to trust` });
    }
  }
  if (adversarialIssues.length > 0) return { status: "REJECTED", challenge: null, issues: adversarialIssues };

  // All independent checks passed — assemble the Challenge, but land it in REVIEW, not ACTIVE (§37).
  const now = new Date().toISOString();
  const challenge: Challenge = {
    challengeId: slugify(draft.title) || `generated-${Date.now()}`,
    version: 1,
    title: draft.title,
    description: draft.description,
    roleContext: [req.role],
    skill: req.skill,
    subskill: req.subskill,
    competencies: [],
    prerequisites: [],
    difficulty: defaultDifficultyVector(req.difficultyLabel),
    difficultyLabel: req.difficultyLabel,
    progressionStage: defaultProgressionStage(req.difficultyLabel),
    taskType: req.taskType,
    supportedLanguages: [req.language],
    learningObjective: req.learningObjective,
    constraints: req.constraints,
    examples: [],
    starterCode: { [req.language]: draft.starterCode },
    publicTests: draft.publicTests.map((t, i) => ({ id: `p${i}`, category: t.category, input: t.input, expectedOutput: t.expectedOutput, hidden: false, points: 1 })),
    hiddenTests: draft.hiddenTests.map((t, i) => ({ id: `h${i}`, category: t.category, input: t.input, expectedOutput: t.expectedOutput, hidden: true, points: 1 })),
    hints: draft.hints,
    solutionMetadata: { referenceSolution: { [req.language]: draft.referenceSolution }, approachSummary: "(AI-drafted — pending human review)" },
    evaluationMetadata: { entryFunction: draft.entryFunction, comparisonMode: "exact" },
    qualityStatus: ChallengeLifecycleStatus.REVIEW,
    qualityAnalytics: null,
    createdAt: now,
    updatedAt: now,
  };

  return { status: "APPROVED", challenge, issues: [] };
}
