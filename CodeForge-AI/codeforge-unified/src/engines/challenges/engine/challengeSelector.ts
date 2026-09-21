/**
 * CodeForge — Challenge Selection Engine (§11, §41)
 *
 * "Create an interpretable ranking mechanism. Do not let an LLM arbitrarily
 * decide everything." This is that mechanism: a weighted sum over named,
 * independently-inspectable factors. No AI call happens anywhere in this
 * file. Every score that goes into the final ranking is also attached to the
 * winning candidate as a SelectionReason, so "why was this challenge
 * selected?" (§41) is answered by reading data this function already
 * computed, not by asking anything to explain itself after the fact.
 */

import {
  ChallengeLifecycleStatus,
  DIFFICULTY_LABEL_ORDER,
  RoleContext,
  TaskType,
  type Challenge,
  type DifficultyLabel,
  type ScoredCandidate,
  type SelectionReason,
  type StudentProfile,
  type SupportedLanguage,
} from "../domain/types";
import { skillLabel, unmetPrerequisites } from "../domain/skillTaxonomy";
import type { SkillGap } from "./skillGapAnalyzer";

export interface SelectorInput {
  profile: StudentProfile;
  candidates: Challenge[];
  gaps: SkillGap[];
  /** Per-skill recommended difficulty — NOT a single global value, since candidates target different skills. */
  recommendedDifficultyForSkill: (skill: string) => DifficultyLabel;
  language: SupportedLanguage;
  /** How many of the most recent exposures to weigh for repetition/diversity penalties. */
  exposureWindow?: number;
}

const WEIGHTS = {
  gap: 0.32,
  role: 0.16,
  difficulty: 0.2,
  freshness: 0.16,
  diversity: 0.08,
  quality: 0.08,
} as const;

function tier(score: number): "LOW" | "MEDIUM" | "HIGH" {
  return score >= 0.75 ? "HIGH" : score >= 0.4 ? "MEDIUM" : "LOW";
}

function roleRelevanceScore(challenge: Challenge, targetRole: RoleContext): number {
  if (challenge.roleContext.includes(targetRole)) return 1.0;
  if (challenge.roleContext.includes(RoleContext.GENERAL_SWE)) return 0.55;
  return 0.15;
}

function difficultyFitScore(challenge: Challenge, recommended: DifficultyLabel): number {
  const steps = Math.abs(DIFFICULTY_LABEL_ORDER.indexOf(challenge.difficultyLabel) - DIFFICULTY_LABEL_ORDER.indexOf(recommended));
  return Math.max(0, 1 - steps * 0.35);
}

function freshnessScore(challenge: Challenge, profile: StudentProfile, window: number): number {
  const recent = profile.exposureHistory.slice(0, window);
  const exactRepeat = recent.some((e) => e.challengeId === challenge.challengeId);
  const sameSkillTaskTypeCount = recent.filter((e) => e.skill === challenge.skill && e.taskType === challenge.taskType).length;
  let penalty = exactRepeat ? 0.9 : 0;
  penalty += Math.min(sameSkillTaskTypeCount * 0.15, 0.45);
  return Math.max(0, 1 - penalty);
}

function taskDiversityScore(challenge: Challenge, profile: StudentProfile): number {
  const last = profile.exposureHistory[0];
  if (!last) return 1.0;
  if (last.taskType !== challenge.taskType) return 1.0;
  if (last.skill !== challenge.skill) return 0.8;
  return 0.4; // same skill AND same task type as the immediately preceding challenge
}

function qualityScore(challenge: Challenge): number {
  const analytics = challenge.qualityAnalytics;
  if (!analytics || analytics.attemptCount < 5) return 1.0; // not enough data to penalize yet
  let penalty = 0;
  if (analytics.passRate > 0.98 || analytics.passRate < 0.02) penalty += 0.3;
  penalty += Math.min(analytics.flags.length * 0.1, 0.3);
  return Math.max(0, 1 - penalty);
}

function buildRationale(challenge: Challenge, reason: Omit<SelectionReason, "rationale">): string {
  const parts: string[] = [];
  parts.push(`Targets ${reason.primaryGap} (${skillLabel(challenge.skill)}), the current priority gap.`);
  if (reason.roleRelevance === "HIGH") parts.push(`Framed directly in the student's target role.`);
  if (reason.difficultyFit === "HIGH") parts.push(`Difficulty matches where the student is right now.`);
  else if (reason.difficultyFit === "MEDIUM") parts.push(`Closest available difficulty match for where the student is right now.`);
  if (reason.recentExposure === "LOW") parts.push(`Little to no recent exposure to this skill/task combination — evidence will be fresh.`);
  if (reason.taskDiversity === "HIGH") parts.push(`A different task type than the immediately preceding challenge, avoiding repetitive drilling.`);
  return parts.join(" ");
}

export function scoreCandidate(challenge: Challenge, input: SelectorInput): ScoredCandidate {
  const window = input.exposureWindow ?? 10;
  const gapEntry = input.gaps.find((g) => g.skill === challenge.skill);
  const gapScoreRaw = gapEntry?.gapScore ?? 0.25; // untracked skill: treat as low-moderate priority, not zero (still has some evidence value)

  const role = roleRelevanceScore(challenge, input.profile.targetRole);
  const difficulty = difficultyFitScore(challenge, input.recommendedDifficultyForSkill(challenge.skill));
  const freshness = freshnessScore(challenge, input.profile, window);
  const diversity = taskDiversityScore(challenge, input.profile);
  const quality = qualityScore(challenge);

  const score =
    Math.min(1, gapScoreRaw) * WEIGHTS.gap +
    role * WEIGHTS.role +
    difficulty * WEIGHTS.difficulty +
    freshness * WEIGHTS.freshness +
    diversity * WEIGHTS.diversity +
    quality * WEIGHTS.quality;

  const partialReason: Omit<SelectionReason, "rationale"> = {
    challengeId: challenge.challengeId,
    primaryGap: gapEntry ? skillLabel(gapEntry.skill) : skillLabel(challenge.skill),
    secondaryGap: input.gaps[1] ? skillLabel(input.gaps[1]!.skill) : null,
    roleRelevance: tier(role),
    difficultyFit: tier(difficulty),
    recentExposure: tier(1 - freshness), // low freshness == high recent exposure
    taskDiversity: tier(diversity),
    score,
  };

  return { challenge, reason: { ...partialReason, rationale: buildRationale(challenge, partialReason) } };
}

/**
 * §11: eligibility is a hard gate (status, language, prerequisites) — a
 * challenge either qualifies or it doesn't. Ranking among what qualifies is
 * the soft, weighted part.
 */
export function eligibleCandidates(input: SelectorInput): Challenge[] {
  return input.candidates.filter(
    (c) =>
      (c.qualityStatus === ChallengeLifecycleStatus.ACTIVE || c.qualityStatus === ChallengeLifecycleStatus.APPROVED) &&
      c.supportedLanguages.includes(input.language) &&
      unmetPrerequisites(input.profile.skills, c.prerequisites).length === 0,
  );
}

export function rankCandidates(input: SelectorInput): ScoredCandidate[] {
  return eligibleCandidates(input)
    .map((c) => scoreCandidate(c, input))
    .sort((a, b) => b.reason.score - a.reason.score);
}

export function selectNextChallenge(input: SelectorInput): ScoredCandidate | null {
  const ranked = rankCandidates(input);
  return ranked[0] ?? null;
}

// re-exported for tests/documentation that want to reference the task-type set explicitly
export const ALL_TASK_TYPES = Object.values(TaskType);
