import type { Blueprint, StoppingDecision } from "../types/domain.js";
import { isNodeCovered, nodesAtLevel } from "./blueprint.js";

export interface StoppingInput {
  blueprint: Blueprint;
  evidenceCountBySkill: Map<string, number>; // raw (unweighted) response counts, per skill
  totalQuestionsAsked: number;
  maxQuestions: number;
  fatigueDetected: boolean;
}

/**
 * Module 12: don't force a fixed question count when reliable evidence
 * already exists, but do have a safety-valve max, and don't push through
 * a student whose evidence quality is degrading from fatigue.
 *
 * Coverage here is judged at the domain level using each leaf skill's own
 * minEvidenceCount (Module 5's blueprint), which is exactly the threshold
 * capabilityEstimator.ts uses to call a node's confidence "moderate" or
 * better — so "covered" and "confident enough" are the same check, not two
 * separate ones that could disagree.
 */
export function evaluateStoppingRule(input: StoppingInput): StoppingDecision {
  if (input.fatigueDetected) {
    return { shouldStop: true, reason: "fatigue_detected" };
  }

  if (input.totalQuestionsAsked >= input.maxQuestions) {
    return { shouldStop: true, reason: "max_questions_reached" };
  }

  const domains = nodesAtLevel(input.blueprint, "domain");
  const allDomainsCovered = domains.every((d) => isNodeCovered(input.blueprint, d.id, input.evidenceCountBySkill));

  if (!allDomainsCovered) {
    return { shouldStop: false, reason: "coverage_incomplete" };
  }

  return { shouldStop: true, reason: "coverage_and_confidence_met" };
}
