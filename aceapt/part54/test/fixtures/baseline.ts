import type { QuestionVersionSnapshot, ValidationContext, ValidatorInput, ValidationMode } from "../../src/contracts/types.js";
import { computeContentHash } from "../../src/hashing/contentHash.js";
import { DefaultScoringNormalizer } from "../../src/ports/DefaultScoringNormalizer.js";
import { InMemorySkillGraphPort, InMemoryAssetStorePort } from "../../src/ports/DefaultPorts.js";

/** A minimal, VALID single-select percentage question — "What is 20% of 500?"
 *  answer 100 — mirrors the spec's own flagship example (§3) exactly, with the
 *  CORRECT answer, so it's a clean baseline every test can mutate from. */
export function baselineSnapshot(overrides: Partial<QuestionVersionSnapshot> = {}): QuestionVersionSnapshot {
  const base: Omit<QuestionVersionSnapshot, "contentHash"> = {
    questionId: "q-1024",
    versionId: "q-1024-v1",
    versionNumber: 1,
    tenantId: null,
    isGlobal: true,
    status: "PUBLISHED",
    purpose: "PRACTICE",
    questionText: "What is 20% of 500?",
    answerType: "SINGLE_SELECT",
    answer: "opt_b",
    options: [
      { id: "opt_a", text: "80", numericValue: 80 },
      { id: "opt_b", text: "100", numericValue: 100 },
      { id: "opt_c", text: "120", numericValue: 120 },
      { id: "opt_d", text: "150", numericValue: 150 }
    ],
    solution: {
      finalAnswer: 100,
      finalExpression: "500 * 0.20",
      steps: [{ id: "s1", order: 1, text: "20% of 500 = 500 * 0.20", expression: "500 * 0.20", expectedValue: 100 }]
    },
    derivation: { domain: "PERCENTAGE", expression: "500 * 0.20" },
    skill: { primarySkillId: "skill.percentage", secondarySkillIds: [] },
    difficulty: { band: "EASY", numericValue: 0.2 },
    assets: [],
    renderBlocks: [{ kind: "MARKDOWN", content: "What is 20% of 500?" }],
    origin: "HUMAN_AUTHORED",
    immutableSinceAssessmentUse: false,
    updatedAt: new Date().toISOString(),
    ...overrides
  };
  const contentHash = computeContentHash(base);
  return { ...base, contentHash };
}

export function makePorts() {
  const skillGraph = new InMemorySkillGraphPort().seed({ id: "skill.percentage", name: "Percentages", operationSignature: ["percentage", "percent-of"] });
  const assetStore = new InMemoryAssetStorePort();
  return { skillGraph, scoringNormalizer: new DefaultScoringNormalizer(), assetStore };
}

export function makeInput(
  snapshot: QuestionVersionSnapshot,
  mode: ValidationMode = "DEEP",
  upstreamResults: ValidationContext["upstreamResults"] = new Map()
): ValidatorInput {
  return {
    questionVersion: snapshot,
    mode,
    context: {
      tenantId: snapshot.tenantId,
      requestedBy: { role: "SYSTEM", id: "test-harness" },
      upstreamResults,
      ports: makePorts()
    }
  };
}
