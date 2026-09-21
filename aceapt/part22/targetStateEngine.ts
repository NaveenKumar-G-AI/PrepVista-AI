import { GoalRequirement, GoalType, LearningGoal } from "../types";

/**
 * Section 10: "The exact metrics must depend on the goal. Do not hardcode
 * one universal readiness definition."
 *
 * Each goal type gets its own requirement profile. TARGET_SCORE /
 * TARGET_ASSESSMENT scale relative to the goal's own targetValue rather than
 * a fixed constant, so "reach 62% -> 78%" produces a different requirement
 * set than "reach 90%".
 */
export function deriveTargetState(goal: LearningGoal): GoalRequirement[] {
  switch (goal.goalType) {
    case GoalType.PLACEMENT_READINESS:
      return [
        {
          metric: "mastery",
          targetValue: 85,
          weight: 0.9,
          rationale: "Placement assessments assume solid concept command across the syllabus, not just the topics practiced most recently.",
        },
        {
          metric: "transfer",
          targetValue: 75,
          weight: 1.0,
          rationale: "Placement questions are rarely phrased the way a student practiced them, so transfer predicts real performance better than raw mastery.",
        },
        {
          metric: "retention",
          targetValue: 80,
          weight: 0.8,
          rationale: "Placement drives can land weeks after prep finishes; retention protects the work already done.",
        },
        {
          metric: "speed",
          targetValue: 75,
          weight: 0.85,
          rationale: "Placement tests are timed, so untimed mastery alone under-predicts the real score.",
        },
        {
          metric: "simulationPerformance",
          targetValue: 75,
          weight: 0.9,
          rationale: "Full-length simulated conditions are the closest available proxy to the real assessment.",
        },
      ];

    case GoalType.APTITUDE_MASTERY:
      return [
        {
          metric: "mastery",
          targetValue: goal.targetValue ?? 80,
          weight: 1.0,
          rationale: "This goal is defined directly as a mastery threshold.",
        },
        {
          metric: "retention",
          targetValue: 70,
          weight: 0.5,
          rationale: "Mastery without retention decays quickly, so a floor is still required even though it isn't the stated goal.",
        },
      ];

    case GoalType.TARGET_SCORE:
    case GoalType.TARGET_ASSESSMENT: {
      const target = goal.targetValue ?? 75;
      return [
        {
          metric: "mastery",
          targetValue: Math.min(95, target + 10),
          weight: 0.7,
          rationale: "Scores usually land a few points below untimed mastery, so mastery needs headroom above the score target.",
        },
        {
          metric: "transfer",
          targetValue: target,
          weight: 0.9,
          rationale: "Assessment questions vary phrasing and context relative to practice sets.",
        },
        {
          metric: "speed",
          targetValue: target,
          weight: 0.9,
          rationale: "The target score is measured under timed conditions.",
        },
        {
          metric: "simulationPerformance",
          targetValue: target,
          weight: 1.0,
          rationale: "Simulation is the most direct proxy for the target score itself.",
        },
      ];
    }

    case GoalType.SKILL_MASTERY:
      return [
        {
          metric: "mastery",
          targetValue: goal.targetValue ?? 85,
          weight: 1.0,
          rationale: "Goal is scoped to a single skill or capability rather than overall readiness.",
        },
      ];

    case GoalType.PERFORMANCE_IMPROVEMENT: {
      const target = goal.targetValue ?? 75;
      return [
        {
          metric: "transfer",
          targetValue: target,
          weight: 0.8,
          rationale: "Improvement goals usually stall on transfer, not raw content coverage.",
        },
        {
          metric: "speed",
          targetValue: target,
          weight: 0.8,
          rationale: "Improvement goals are typically measured under timed conditions.",
        },
      ];
    }

    case GoalType.MAINTENANCE:
      return [
        {
          metric: "retention",
          targetValue: 80,
          weight: 1.0,
          rationale: "Maintenance goals protect existing performance rather than raise it (Section 35).",
        },
      ];

    case GoalType.TARGET_ROLE:
    case GoalType.TARGET_DATE:
    case GoalType.CUSTOM:
    default:
      return [
        {
          metric: "mastery",
          targetValue: goal.targetValue ?? 75,
          weight: 0.6,
          rationale: "Fallback profile — no specific requirement mapping defined yet for this goal type.",
        },
        {
          metric: "transfer",
          targetValue: (goal.targetValue ?? 75) - 5,
          weight: 0.6,
          rationale: "Fallback profile.",
        },
      ];
  }
}
