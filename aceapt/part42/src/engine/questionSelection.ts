import type { Blueprint, BlueprintNode, DiagnosticConfidenceState, DiagnosticQuestion, QuestionDifficulty } from "../types/domain.js";
import { nodeById, nodesAtLevel, descendantSkills } from "./blueprint.js";

const DIFFICULTY_ORDER: QuestionDifficulty[] = ["easy", "medium", "hard", "very_hard"];

const UNCERTAINTY_SCORE: Record<DiagnosticConfidenceState, number> = {
  incomplete: 1,
  low: 0.75,
  conflicted: 0.9, // conflicted evidence is exactly where more targeted questions help most
  moderate: 0.4,
  high: 0.1,
};

export interface SkillSnapshot {
  pointEstimate: number;
  confidenceState: DiagnosticConfidenceState;
  evidenceCount: number;
}

export interface SelectionContext {
  skillSnapshots: Map<string, SkillSnapshot>; // by skillNodeId
  exposures: Map<string, number>; // questionId -> times previously seen by this student
}

const WEIGHT_COVERAGE = 0.45;
const WEIGHT_UNCERTAINTY = 0.35;
const WEIGHT_DIFFICULTY_MATCH = 0.2;

function idealDifficultyIndex(pointEstimate: number): number {
  if (pointEstimate < 0.35) return 0; // easy
  if (pointEstimate < 0.6) return 1; // medium
  if (pointEstimate < 0.8) return 2; // hard
  return 3; // very_hard
}

function difficultyMatchScore(difficulty: QuestionDifficulty, pointEstimate: number): number {
  const ideal = idealDifficultyIndex(pointEstimate);
  const actual = DIFFICULTY_ORDER.indexOf(difficulty);
  return 1 - Math.abs(ideal - actual) / (DIFFICULTY_ORDER.length - 1);
}

/**
 * The fundamental question (Module 4): "which question gives ACEAPT the
 * most useful information about this student's capability?" Coverage need
 * and uncertainty dominate the score; difficulty match refines within
 * that. Exposure is a steep penalty, not a hard exclusion — Module 56's
 * "insufficient question pool" edge case means a previously-seen question
 * must still be selectable when it's genuinely the only option left, just
 * heavily deprioritized (and, via evidenceQuality.ts, worth much less once
 * answered).
 */
export function scoreCandidate(question: DiagnosticQuestion, blueprintNode: BlueprintNode, ctx: SelectionContext): number {
  if (question.qualityStatus === "retired") return -Infinity;

  const snapshot = ctx.skillSnapshots.get(question.skillNodeId);
  const evidenceCount = snapshot?.evidenceCount ?? 0;
  const coverageNeed = Math.max(0, blueprintNode.minEvidenceCount - evidenceCount) / Math.max(1, blueprintNode.minEvidenceCount);
  const uncertaintyScore = UNCERTAINTY_SCORE[snapshot?.confidenceState ?? "incomplete"];
  const difficultyMatch = difficultyMatchScore(question.difficulty, snapshot?.pointEstimate ?? 0.5);

  let score =
    WEIGHT_COVERAGE * coverageNeed + WEIGHT_UNCERTAINTY * uncertaintyScore + WEIGHT_DIFFICULTY_MATCH * difficultyMatch;

  const timesSeen = ctx.exposures.get(question.id) ?? 0;
  if (timesSeen > 0) score -= 0.6 + 0.1 * Math.min(timesSeen, 3);

  if (question.qualityStatus === "flagged") score -= 0.5;

  return score;
}

export interface SelectionResult {
  question: DiagnosticQuestion;
  skillNodeId: string;
  score: number;
}

/**
 * Picks the single best next question across every skill with candidates.
 * candidatesBySkill should already be filtered to quality_status != 'retired'
 * where possible (the score also hard-excludes retired defensively).
 */
export function selectNextQuestion(
  blueprint: Blueprint,
  candidatesBySkill: Map<string, DiagnosticQuestion[]>,
  ctx: SelectionContext,
): SelectionResult | null {
  let best: SelectionResult | null = null;

  for (const skillNode of nodesAtLevel(blueprint, "skill")) {
    const candidates = candidatesBySkill.get(skillNode.id) ?? [];
    for (const q of candidates) {
      const score = scoreCandidate(q, skillNode, ctx);
      if (score === -Infinity) continue;
      if (!best || score > best.score) {
        best = { question: q, skillNodeId: skillNode.id, score };
      }
    }
  }

  return best;
}

/** Module 31: whether a question is fresh enough to count as strong independent evidence. */
export function isFreshQuestion(questionId: string, exposures: Map<string, number>): boolean {
  return (exposures.get(questionId) ?? 0) === 0;
}

export function skillLeavesNeedingCoverage(blueprint: Blueprint, domainNodeId: string, evidenceCountBySkill: Map<string, number>): BlueprintNode[] {
  return descendantSkills(blueprint, domainNodeId).filter(
    (leaf) => (evidenceCountBySkill.get(leaf.id) ?? 0) < leaf.minEvidenceCount,
  );
}

export function resolveNode(blueprint: Blueprint, nodeId: string): BlueprintNode | undefined {
  return nodeById(blueprint, nodeId);
}
