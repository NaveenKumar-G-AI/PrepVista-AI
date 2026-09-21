// ============================================================================
// Phase 9 — question selection.
//
// "Question selection must consider: role relevance, skill importance,
// current evidence, evidence confidence, skill gap, difficulty, previous
// questions, previous answers, coverage. Avoid repeatedly testing
// already-proven skills unless verification is intentionally required."
//
// This module answers exactly one question: WHICH skill should the next
// question target? Turning that choice into actual question text is
// questionGeneration.ts's job; this file never talks to the AI gateway.
// ============================================================================

import type { BlueprintSkillTarget, SessionCoverage, SkillGapSummary } from "../domain/types.js";

const IMPORTANCE_WEIGHT: Record<BlueprintSkillTarget["importance"], number> = {
  CORE: 4,
  IMPORTANT: 3,
  SUPPORTING: 2,
  OPTIONAL: 1,
};

const GAP_PRIORITY_WEIGHT: Record<SkillGapSummary["priority"], number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export interface SkillCandidateInput {
  target: BlueprintSkillTarget;
  gap?: SkillGapSummary;
}

export interface SelectedSkill {
  skillId: string;
  reason: string;
  score: number;
  suggestedDifficulty: 1 | 2 | 3 | 4 | 5;
}

/**
 * Deterministic, explainable scoring — every factor the phase spec lists
 * contributes a term, and the winning skill's `reason` string names the
 * terms that mattered, which is what makes this auditable (Phase 68) instead
 * of an opaque ranking.
 */
export function selectNextSkill(
  candidates: SkillCandidateInput[],
  coverage: SessionCoverage,
  baseDifficulty: 1 | 2 | 3 | 4 | 5 | "ADAPTIVE",
): SelectedSkill | null {
  const scored = candidates
    .map((candidate) => scoreCandidate(candidate, coverage, baseDifficulty))
    .filter((s): s is SelectedSkill => s !== null)
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
}

function scoreCandidate(
  candidate: SkillCandidateInput,
  coverage: SessionCoverage,
  baseDifficulty: 1 | 2 | 3 | 4 | 5 | "ADAPTIVE",
): SelectedSkill | null {
  const { target, gap } = candidate;
  const entry = coverage[target.skillId];
  const questionsAsked = entry?.questionsAsked ?? 0;

  // Hard stop: never exceed the blueprint's max for this skill.
  if (questionsAsked >= target.maxQuestions) return null;

  const alreadySufficient = entry?.status === "SUFFICIENT";
  if (alreadySufficient && !target.forceVerification) return null; // "avoid repeatedly testing already-proven skills"

  const reasons: string[] = [];
  let score = 0;

  const importanceScore = IMPORTANCE_WEIGHT[target.importance];
  score += importanceScore;
  reasons.push(`${target.importance.toLowerCase()} role skill`);

  if (gap) {
    score += GAP_PRIORITY_WEIGHT[gap.priority];
    reasons.push(`${gap.priority.toLowerCase()}-priority role gap`);
  }

  const confidence = entry?.currentConfidence ?? 0;
  const lowConfidenceBoost = (1 - confidence) * 2; // low confidence -> more worth asking about
  score += lowConfidenceBoost;
  if (confidence < 0.4) reasons.push("low current evidence confidence");

  const state = entry?.currentEvidenceState ?? "UNASSESSED";
  if (state === "UNASSESSED") {
    score += 1.5;
    reasons.push("no evidence collected yet");
  } else if (state === "UNCERTAIN") {
    score += 1;
    reasons.push("evidence currently uncertain");
  }

  // Below the blueprint's minimum for this skill — always worth asking.
  if (questionsAsked < target.minQuestions) {
    score += 2;
    reasons.push("below minimum question count for this skill");
  }

  if (target.forceVerification && alreadySufficient) {
    score += 1;
    reasons.push("explicit re-verification requested");
  }

  const suggestedDifficulty = deriveSuggestedDifficulty(baseDifficulty, confidence, questionsAsked);

  return {
    skillId: target.skillId,
    reason: reasons.join("; "),
    score,
    suggestedDifficulty,
  };
}

function deriveSuggestedDifficulty(
  baseDifficulty: 1 | 2 | 3 | 4 | 5 | "ADAPTIVE",
  confidence: number,
  questionsAsked: number,
): 1 | 2 | 3 | 4 | 5 {
  if (baseDifficulty !== "ADAPTIVE") return baseDifficulty;
  // Start moderate; climb for a student showing strong prior confidence,
  // and nudge up slightly on follow-up rounds within the same skill so a
  // second or third question doesn't just repeat the first one's level.
  let level = 2 + Math.round(confidence * 2) + Math.min(questionsAsked, 2) * 0.5;
  level = Math.max(1, Math.min(5, Math.round(level)));
  return level as 1 | 2 | 3 | 4 | 5;
}
