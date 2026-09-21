import { round } from "../utils/format.js";

const SIGNIFICANT_GAP_THRESHOLD = 10;

export interface PracticeAssessmentGapResult {
  practiceScore: number;
  assessmentScore: number;
  gap: number;
  hasSignificantGap: boolean;
  explanation: string;
}

/** Section 27: practice-vs-assessment gap is one of the most valuable signals
 * — often more informative than another practice score. */
export function detectPracticeAssessmentGap(
  practiceScore: number,
  assessmentScore: number,
  threshold = SIGNIFICANT_GAP_THRESHOLD,
): PracticeAssessmentGapResult {
  const gap = round(practiceScore - assessmentScore);
  const hasSignificantGap = gap >= threshold;
  const explanation = hasSignificantGap
    ? `Practice performance (${round(practiceScore)}%) is notably stronger than performance under assessment conditions (${round(assessmentScore)}%) — a ${gap}-point gap.`
    : "Practice and assessment performance are broadly aligned.";
  return { practiceScore: round(practiceScore), assessmentScore: round(assessmentScore), gap, hasSignificantGap, explanation };
}

export interface FamiliarityGapResult {
  familiarScore: number;
  novelScore: number;
  gap: number;
  hasSignificantGap: boolean;
  explanation: string;
}

/** Section 29: familiar-question performance can look like mastery when it's
 * really familiarity. Don't let a high familiar score stand in for mastery
 * when novel-question performance tells a different story. */
export function detectFamiliarityGap(
  familiarScore: number,
  novelScore: number,
  threshold = SIGNIFICANT_GAP_THRESHOLD,
): FamiliarityGapResult {
  const gap = round(familiarScore - novelScore);
  const hasSignificantGap = gap >= threshold;
  const explanation = hasSignificantGap
    ? `Familiar-question performance (${round(familiarScore)}%) is strong, but transfer to novel questions (${round(novelScore)}%) remains weaker.`
    : "Performance on familiar and novel questions is broadly aligned.";
  return { familiarScore: round(familiarScore), novelScore: round(novelScore), gap, hasSignificantGap, explanation };
}

// ---------------------------------------------------------------------------
// Failure boundary (section 28)
// ---------------------------------------------------------------------------

export type FailureBoundaryStageName = "NORMAL" | "MIXED" | "NOVEL" | "TIMED" | "SIMULATION";
const STAGE_ORDER: FailureBoundaryStageName[] = ["NORMAL", "MIXED", "NOVEL", "TIMED", "SIMULATION"];

export interface FailureBoundaryStage {
  stage: FailureBoundaryStageName;
  score: number;
}

export type FailureBoundaryClassification = "NOVELTY" | "TIME_PRESSURE" | "COMBINED" | "STABLE" | "INSUFFICIENT_DATA";

export interface FailureBoundaryResult {
  stages: FailureBoundaryStage[];
  weakestDrop: { from: FailureBoundaryStageName; to: FailureBoundaryStageName; drop: number } | null;
  classification: FailureBoundaryClassification;
  explanation: string;
}

const STABLE_TOTAL_DROP_THRESHOLD = 8; // total NORMAL-to-weakest drop below this = "holds up"
const SOLO_DROP_THRESHOLD = 10; // one factor alone is large enough to name on its own
const JOINT_DROP_THRESHOLD = 6; // both factors at/above this each => classify as combined

/**
 * Progressively tests NORMAL -> MIXED -> NOVEL -> TIMED -> SIMULATION and
 * finds where capability becomes unstable (section 28). Classification looks
 * at *cumulative* degradation attributable to novelty (NORMAL -> NOVEL) vs.
 * to added time pressure (NOVEL -> TIMED/SIMULATION) rather than just
 * whichever single consecutive step happens to be steepest — a student who
 * drops steadily across every stage is a genuinely different, and worse,
 * pattern than one clean cliff at a single stage, and the spec's own example
 * (a steady 91->86->77->69->63 slide) is explicitly meant to read as
 * "combined," not as whichever one step was marginally the largest.
 */
export function detectFailureBoundary(stages: FailureBoundaryStage[]): FailureBoundaryResult {
  const present = STAGE_ORDER.map((s) => stages.find((st) => st.stage === s)).filter(
    (s): s is FailureBoundaryStage => s != null,
  );

  if (present.length < 2) {
    return {
      stages: present,
      weakestDrop: null,
      classification: "INSUFFICIENT_DATA",
      explanation: "Not enough progressive-difficulty evidence yet to map a failure boundary.",
    };
  }

  // Steepest single consecutive-stage step, kept for the explanation detail.
  let weakest: { from: FailureBoundaryStageName; to: FailureBoundaryStageName; drop: number } | null = null;
  for (let i = 1; i < present.length; i++) {
    const prev = present[i - 1]!;
    const cur = present[i]!;
    const drop = round(prev.score - cur.score);
    if (drop > 0 && (weakest == null || drop > weakest.drop)) {
      weakest = { from: prev.stage, to: cur.stage, drop };
    }
  }

  const normalScore = present.find((s) => s.stage === "NORMAL")?.score ?? present[0]!.score;
  const novelScore = present.find((s) => s.stage === "NOVEL")?.score ?? null;
  const timedOrSimScore =
    present.find((s) => s.stage === "SIMULATION")?.score ?? present.find((s) => s.stage === "TIMED")?.score ?? null;
  const weakestScore = Math.min(...present.map((s) => s.score));
  const totalDrop = round(normalScore - weakestScore);

  if (totalDrop < STABLE_TOTAL_DROP_THRESHOLD) {
    return {
      stages: present,
      weakestDrop: weakest,
      classification: "STABLE",
      explanation: "Capability holds up consistently across normal, mixed, novel, and timed conditions.",
    };
  }

  const noveltyDrop = novelScore != null ? round(normalScore - novelScore) : null;
  const timeDrop = timedOrSimScore != null ? round((novelScore ?? normalScore) - timedOrSimScore) : null;

  let classification: FailureBoundaryClassification;
  if (noveltyDrop != null && timeDrop != null && noveltyDrop >= JOINT_DROP_THRESHOLD && timeDrop >= JOINT_DROP_THRESHOLD) {
    classification = "COMBINED";
  } else if (noveltyDrop != null && noveltyDrop >= SOLO_DROP_THRESHOLD && (timeDrop == null || timeDrop < JOINT_DROP_THRESHOLD)) {
    classification = "NOVELTY";
  } else if (timeDrop != null && timeDrop >= SOLO_DROP_THRESHOLD && (noveltyDrop == null || noveltyDrop < JOINT_DROP_THRESHOLD)) {
    classification = "TIME_PRESSURE";
  } else if (noveltyDrop != null && timeDrop != null) {
    classification = noveltyDrop >= timeDrop ? "NOVELTY" : "TIME_PRESSURE";
  } else if (noveltyDrop != null) {
    classification = "NOVELTY";
  } else if (timeDrop != null) {
    classification = "TIME_PRESSURE";
  } else {
    classification = "STABLE";
  }

  const explanation =
    classification === "COMBINED"
      ? `Current capability becomes unstable under combined novelty and time pressure: roughly ${noveltyDrop} points lost to unfamiliar questions, and a further ${timeDrop} once time pressure is added on top.`
      : classification === "NOVELTY"
        ? `Performance drops most when questions become unfamiliar (a ${noveltyDrop}-point drop from normal to novel conditions), more than from time pressure alone.`
        : classification === "TIME_PRESSURE"
          ? `Performance holds up under novelty but drops sharply once time pressure is added (a ${timeDrop}-point drop).`
          : weakest
            ? `The largest single drop happens between ${weakest.from} and ${weakest.to} (${weakest.drop} points).`
            : "Capability becomes less stable under harder conditions, though no single factor dominates.";

  return { stages: present, weakestDrop: weakest, classification, explanation };
}
