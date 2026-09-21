/**
 * §38 — dependency states, from enough evidence, never a permanent label.
 * §39–40 — guidance fading, measured, not assumed.
 */

import { DependencyState } from "../domain/types";

const MIN_SAMPLES_FOR_A_LABEL = 3; // §38: "use enough evidence"

/**
 * Given the hint levels used to reach the last few successes for a skill, and whether each of
 * those needed an escalation, decide how dependent the student currently looks. Small samples
 * stay UNKNOWN rather than being forced into a label.
 */
export function computeDependencyState(recentHintLevels: number[], recentEscalationFlags: boolean[]): DependencyState {
  if (recentHintLevels.length < MIN_SAMPLES_FOR_A_LABEL) return DependencyState.UNKNOWN;

  const avgLevel = recentHintLevels.reduce((a, b) => a + b, 0) / recentHintLevels.length;
  const escalationRate =
    recentEscalationFlags.length > 0 ? recentEscalationFlags.filter(Boolean).length / recentEscalationFlags.length : 0;

  if (avgLevel <= 1.5 && escalationRate <= 0.2) return DependencyState.LOW;
  if (avgLevel > 3 || escalationRate > 0.5) return DependencyState.HIGH;
  return DependencyState.MODERATE;
}

export type FadingTrend = "DECREASING" | "STABLE" | "INCREASING" | "NOT_ENOUGH_DATA";

/**
 * §39: "High guidance → Moderate → Light → Independent" should be a measurable outcome, not a
 * vibe. Takes one average-hint-level-per-problem data point per problem solved (in order) and
 * says which way it's trending.
 */
export function fadingTrend(avgLevelPerProblemInOrder: number[]): FadingTrend {
  if (avgLevelPerProblemInOrder.length < 2) return "NOT_ENOUGH_DATA";
  const first = avgLevelPerProblemInOrder[0];
  const last = avgLevelPerProblemInOrder[avgLevelPerProblemInOrder.length - 1];
  const delta = last - first;
  if (delta < -0.4) return "DECREASING";
  if (delta > 0.4) return "INCREASING";
  return "STABLE";
}
