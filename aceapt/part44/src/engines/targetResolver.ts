// Target-state resolution (Section 19). Priority order, highest first:
//   1. A target the student explicitly set
//   2. A validated assessment-specific benchmark (Section 48) - only if
//      ACEAPT actually has one, never invented
//   3. A goal-type configured benchmark (this file)
//   4. For "improve from where I am" goals, current + a configured delta
//   5. Otherwise: left unset (TARGET_PENDING). Never guessed.
import type {
  CapabilityDimension,
  CapabilitySnapshot,
  GoalType,
  SpeedBand,
} from "../domain/types.js";

const NEXT_SPEED_BAND: Record<SpeedBand, SpeedBand> = {
  SLOW: "DEVELOPING",
  DEVELOPING: "ON_PACE",
  ON_PACE: "FAST",
  FAST: "FAST",
};

/** Configured benchmarks - a product decision, not a guess. In the real
 * codebase these would live in ACEAPT's existing benchmark configuration
 * (Section 48); duplicated here as constants only because this is a
 * standalone reference implementation. */
const BROAD_READINESS_BENCHMARK: Partial<Record<CapabilityDimension, number>> = {
  quant: 75,
  logical: 75,
  verbal: 75,
  probability: 70,
  data_interpretation: 70,
};
const BROAD_READINESS_ACCURACY = 80;
const BROAD_READINESS_SPEED: SpeedBand = "ON_PACE";

const SKILL_IMPROVEMENT_DELTA = 15;
const PERFORMANCE_IMPROVEMENT_DELTA = 10;
const ACCURACY_IMPROVEMENT_DELTA = 10;

export interface ResolveTargetInput {
  goalType: GoalType;
  current: CapabilitySnapshot;
  /** What the student explicitly supplied (from goal creation input or
   * confirmed AI-extracted fields). Always wins over any default. */
  explicit: {
    capability?: Partial<Record<CapabilityDimension, number>>;
    accuracy?: number;
    speedBand?: SpeedBand;
  };
  /** The dimension a student-reported weakness resolved to, if any -
   * used as the focus dimension for SKILL_IMPROVEMENT goals. */
  focusDimension?: CapabilityDimension;
  assessmentBenchmark?: {
    capability?: Partial<Record<CapabilityDimension, number>>;
    accuracy?: number;
  };
}

export interface ResolvedTarget {
  capability: Partial<Record<CapabilityDimension, number>>;
  accuracy: number | null;
  speedBand: SpeedBand | null;
  /** Dimensions the student/goal explicitly named as the focus - feeds
   * priorityEngine's goalRelevance boost. Deliberately does NOT include
   * dimensions that only received a default/benchmark target. */
  explicitlyTargetedDimensions: Set<CapabilityDimension>;
  /** Which source produced each field, for the explanation service and
   * for the UI's "why this target" affordance. Never silently blended. */
  sources: Record<string, "STUDENT" | "ASSESSMENT_BENCHMARK" | "GOAL_TYPE_BENCHMARK" | "CURRENT_PLUS_DELTA">;
}

export function resolveTarget(input: ResolveTargetInput): ResolvedTarget {
  const { goalType, current, explicit, assessmentBenchmark, focusDimension } = input;
  const capability: Partial<Record<CapabilityDimension, number>> = {};
  const sources: ResolvedTarget["sources"] = {};
  const explicitlyTargetedDimensions = new Set<CapabilityDimension>();

  // 1 & 2 & 3: explicit > assessment benchmark > goal-type benchmark,
  // for the broad goal types that have one.
  const usesBroadBenchmark =
    goalType === "PLACEMENT_READINESS" ||
    goalType === "OVERALL_APTITUDE" ||
    goalType === "ASSESSMENT_PREPARATION" ||
    goalType === "PERFORMANCE_IMPROVEMENT";

  if (usesBroadBenchmark) {
    const dims = new Set<CapabilityDimension>([
      ...(Object.keys(BROAD_READINESS_BENCHMARK) as CapabilityDimension[]),
      ...(Object.keys(current.scores) as CapabilityDimension[]),
    ]);
    for (const dim of dims) {
      if (explicit.capability?.[dim] !== undefined) {
        capability[dim] = explicit.capability[dim];
        sources[dim] = "STUDENT";
        explicitlyTargetedDimensions.add(dim);
      } else if (assessmentBenchmark?.capability?.[dim] !== undefined) {
        capability[dim] = assessmentBenchmark.capability[dim];
        sources[dim] = "ASSESSMENT_BENCHMARK";
      } else if (
        goalType === "PERFORMANCE_IMPROVEMENT" &&
        current.scores[dim] !== undefined
      ) {
        capability[dim] = round2(current.scores[dim]! + PERFORMANCE_IMPROVEMENT_DELTA);
        sources[dim] = "CURRENT_PLUS_DELTA";
      } else if (BROAD_READINESS_BENCHMARK[dim] !== undefined) {
        capability[dim] = BROAD_READINESS_BENCHMARK[dim];
        sources[dim] = "GOAL_TYPE_BENCHMARK";
      }
      // else: left unset. TARGET_PENDING for this dimension.
    }
  } else if (goalType === "SKILL_IMPROVEMENT" || goalType === "CUSTOM") {
    // Only ever targets what was explicitly named - never a broad guess.
    for (const [dim, value] of Object.entries(explicit.capability ?? {}) as [
      CapabilityDimension,
      number
    ][]) {
      capability[dim] = value;
      sources[dim] = "STUDENT";
      explicitlyTargetedDimensions.add(dim);
    }
    if (
      focusDimension &&
      capability[focusDimension] === undefined &&
      current.scores[focusDimension] !== undefined
    ) {
      capability[focusDimension] = round2(current.scores[focusDimension]! + SKILL_IMPROVEMENT_DELTA);
      sources[focusDimension] = "CURRENT_PLUS_DELTA";
      explicitlyTargetedDimensions.add(focusDimension);
    }
  }
  // SPEED_IMPROVEMENT / ACCURACY_IMPROVEMENT goals don't get capability
  // defaults at all - see accuracy/speedBand resolution below instead.

  // Accuracy
  let accuracy: number | null = null;
  if (explicit.accuracy !== undefined) {
    accuracy = explicit.accuracy;
  } else if (assessmentBenchmark?.accuracy !== undefined) {
    accuracy = assessmentBenchmark.accuracy;
  } else if (goalType === "ACCURACY_IMPROVEMENT" && current.accuracy !== undefined) {
    accuracy = round2(Math.min(95, current.accuracy + ACCURACY_IMPROVEMENT_DELTA));
  } else if (usesBroadBenchmark) {
    accuracy = BROAD_READINESS_ACCURACY;
  }

  // Speed band
  let speedBand: SpeedBand | null = null;
  if (explicit.speedBand) {
    speedBand = explicit.speedBand;
  } else if (goalType === "SPEED_IMPROVEMENT" && current.speedBand) {
    speedBand = NEXT_SPEED_BAND[current.speedBand];
  } else if (usesBroadBenchmark) {
    speedBand = BROAD_READINESS_SPEED;
  }

  return { capability, accuracy, speedBand, explicitlyTargetedDimensions, sources };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
