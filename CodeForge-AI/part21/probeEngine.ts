/**
 * Adaptive Probe Engine.
 *
 * Implements the loop from the spec:
 *   Existing Evidence -> Confidence Map -> Most Important Uncertain Concept
 *   -> Best Probe -> Student Response -> Evidence Update -> Next Probe
 *
 * This module is pure/deterministic: given the current profile + evidence +
 * a mental model, it decides WHAT to ask next (dimension, concept, probe
 * type, difficulty). It does not generate the probe's actual question text
 * — that's the generators/* modules, which call the AI layer. Keeping
 * selection deterministic means the "why did it ask this" trace is always
 * explainable without an AI call, and is what tests/engines.test.ts pins
 * down precisely.
 */
import {
  DIFFICULTY_LADDER,
  PROBE_TYPE_DIFFICULTY as PROBE_TYPE_DIFFICULTY_LOOKUP,
  UNDERSTANDING_DIMENSIONS,
  type DifficultyRung,
  type DimensionProfile,
  type EvidenceItem,
  type MentalModel,
  type ProbeType,
  type RoleContext,
  type UnderstandingDimension,
} from "@/types/index.js";

/** A dimension whose confidence has reached this threshold is treated as
 *  "resolved" — further probing there stops, whether the resolution was
 *  positive (strong) or negative (a confidently-identified gap). Matches:
 *  "If the student demonstrates strong understanding of a concept, reduce
 *  further questioning on that concept." */
export const RESOLVED_CONFIDENCE_THRESHOLD = 65;

/** Hard cap so a stubbornly ambiguous dimension can't consume the whole probe budget. */
export const MAX_PROBES_PER_DIMENSION = 3;

/** Rungs that require prior lower-rung evidence before they're "justified",
 *  unless the shortcut condition below is met. */
const ADVANCED_RUNGS: DifficultyRung[] = ["modification", "transfer"];

export const DIMENSION_PREFERRED_PROBE_TYPES: Record<UnderstandingDimension, ProbeType[]> = {
  problem: ["explanation"],
  algorithm: ["explanation", "causal_why", "alternative_approach"],
  data_structure: ["explanation", "causal_why", "alternative_approach"],
  state: ["state_trace", "prediction", "debugging"],
  control_flow: ["prediction", "state_trace", "causal_why"],
  invariant: ["invariant", "counterfactual", "debugging"],
  correctness: ["causal_why", "edge_case", "debugging"],
  complexity: ["complexity", "counterfactual"],
  space: ["complexity", "counterfactual"],
  edge_case: ["edge_case", "prediction"],
  debugging: ["debugging", "causal_why"],
  adaptation: ["modification", "counterfactual"],
  transfer: ["transfer", "alternative_approach"],
};

function importanceWeight(dimension: UnderstandingDimension, role?: RoleContext): number {
  const explicit = role?.dimensionEmphasis?.[dimension];
  return explicit ?? 1;
}

/**
 * "Recognition" (the easiest ladder rung) is treated as already satisfied
 * once the code runs and passes tests — no probe type targets it directly.
 * The probe-generated ladder therefore effectively starts at "explanation".
 */
function nextDifficultyForDimension(items: EvidenceItem[]): DifficultyRung {
  const attemptedRungs = new Set(
    items.map((i) => PROBE_TYPE_DIFFICULTY_LOOKUP[i.probe_type])
  );
  const hasSolidCausalEvidence = items.some(
    (i) => i.result === "correct" && (PROBE_TYPE_DIFFICULTY_LOOKUP[i.probe_type] === "causal_reasoning" || PROBE_TYPE_DIFFICULTY_LOOKUP[i.probe_type] === "prediction")
  );

  for (const rung of DIFFICULTY_LADDER) {
    if (rung === "recognition") continue;
    if (attemptedRungs.has(rung)) continue;
    if (ADVANCED_RUNGS.includes(rung) && !hasSolidCausalEvidence && attemptedRungs.size < 2) {
      continue; // not justified yet — climb lower rungs first
    }
    return rung;
  }
  return "transfer"; // every rung attempted at least once — reassess at the top for growth tracking
}

function pickProbeType(dimension: UnderstandingDimension, rung: DifficultyRung, alreadyAttempted: Set<ProbeType>): ProbeType {
  const preferred = DIMENSION_PREFERRED_PROBE_TYPES[dimension];

  const matchingRung = preferred.filter((t) => PROBE_TYPE_DIFFICULTY_LOOKUP[t] === rung && !alreadyAttempted.has(t));
  if (matchingRung.length > 0) return matchingRung[0]!;

  // No preferred type sits exactly on the requested rung (not every
  // dimension's preferred list spans every rung). Prefer any other
  // not-yet-attempted NON-advanced type before ever reaching for a
  // modification/transfer-rung type here — this keeps the "don't jump to
  // difficult tasks unjustified" gate meaningful even in the fallback path.
  const nonAdvancedUnattempted = preferred.filter(
    (t) => !alreadyAttempted.has(t) && !ADVANCED_RUNGS.includes(PROBE_TYPE_DIFFICULTY_LOOKUP[t])
  );
  if (nonAdvancedUnattempted.length > 0) return nonAdvancedUnattempted[0]!;

  // Truly nothing non-advanced left for this dimension — advancing is the
  // only way to keep making progress on it.
  const anyUnattempted = preferred.find((t) => !alreadyAttempted.has(t));
  return anyUnattempted ?? preferred[preferred.length - 1]!;
}

export function pickConcept(dimension: UnderstandingDimension, mentalModel: MentalModel): string {
  switch (dimension) {
    case "problem":
      return mentalModel.problem_objective;
    case "algorithm":
      return mentalModel.algorithm;
    case "data_structure":
      return mentalModel.data_structures[0] ?? "the data structure used";
    case "state":
      return mentalModel.important_variables[0]?.name ?? "key state variables";
    case "control_flow":
      return mentalModel.control_flow_summary;
    case "invariant":
      return mentalModel.candidate_invariants[0] ?? "the loop invariant";
    case "correctness":
      return mentalModel.correctness_argument;
    case "complexity":
      return `${mentalModel.complexity.time} time complexity`;
    case "space":
      return `${mentalModel.complexity.space} space complexity`;
    case "edge_case":
      return mentalModel.relevant_edge_cases[0] ?? "boundary input handling";
    case "debugging":
      return "a deliberately introduced bug";
    case "adaptation":
      return "a changed requirement";
    case "transfer":
      return "the underlying algorithmic pattern applied to a related problem";
    default:
      return dimension;
  }
}

export interface ProbeSpec {
  dimension: UnderstandingDimension;
  concept: string;
  probeType: ProbeType;
  difficulty: DifficultyRung;
  isClarification: boolean;
  reason: string;
}

export interface SelectNextProbeInput {
  dimensions: Record<UnderstandingDimension, DimensionProfile>;
  evidenceByDimension: Record<UnderstandingDimension, EvidenceItem[]>;
  mentalModel: MentalModel;
  probesAsked: number;
  maxProbes: number;
  role?: RoleContext;
  lastEvidence?: EvidenceItem;
}

/** Returns the next probe spec, or null when assessment should terminate
 *  (budget exhausted or every dimension has resolved one way or the other). */
export function selectNextProbe(input: SelectNextProbeInput): ProbeSpec | null {
  if (input.probesAsked >= input.maxProbes) return null;

  // Ambiguous answers get one immediate, same-concept clarifying follow-up
  // before the engine is allowed to move on — per spec: "If the answer is
  // ambiguous, ask a clarifying probe."
  if (input.lastEvidence?.result === "ambiguous") {
    const dim = input.lastEvidence.dimension;
    const priorCount = input.evidenceByDimension[dim]?.length ?? 0;
    if (priorCount < MAX_PROBES_PER_DIMENSION) {
      return {
        dimension: dim,
        concept: input.lastEvidence.concept,
        probeType: input.lastEvidence.probe_type,
        difficulty: PROBE_TYPE_DIFFICULTY_LOOKUP[input.lastEvidence.probe_type],
        isClarification: true,
        reason: `Prior response on "${input.lastEvidence.concept}" was ambiguous — asking a clarifying follow-up before moving on.`,
      };
    }
  }

  const candidates = UNDERSTANDING_DIMENSIONS.filter((d) => {
    const profile = input.dimensions[d];
    const evidenceCount = input.evidenceByDimension[d]?.length ?? 0;
    if (evidenceCount >= MAX_PROBES_PER_DIMENSION) return false;
    return profile.status === "not_assessed" || profile.confidence < RESOLVED_CONFIDENCE_THRESHOLD;
  });

  if (candidates.length === 0) return null; // every dimension resolved (or budget-capped) — done

  let best: { dimension: UnderstandingDimension; score: number } | null = null;
  for (const d of candidates) {
    const profile = input.dimensions[d];
    const uncertainty = Math.max(1, RESOLVED_CONFIDENCE_THRESHOLD - profile.confidence);
    const unassessedBonus = profile.status === "not_assessed" ? 20 : 0;
    const score = importanceWeight(d, input.role) * uncertainty + unassessedBonus;
    if (!best || score > best.score) {
      best = { dimension: d, score };
    }
  }
  const chosenDimension = best!.dimension;

  const priorItems = input.evidenceByDimension[chosenDimension] ?? [];
  const attemptedTypes = new Set(priorItems.map((i) => i.probe_type));
  const targetRung = nextDifficultyForDimension(priorItems);
  const probeType = pickProbeType(chosenDimension, targetRung, attemptedTypes);
  // The dimension's preferred probe types don't necessarily cover every
  // rung (e.g. "algorithm" has no dedicated prediction-rung probe type) —
  // report the ACTUAL chosen probe's rung so difficulty never lies about
  // what was really asked, even when it had to fall back off targetRung.
  const difficulty = PROBE_TYPE_DIFFICULTY_LOOKUP[probeType];
  const concept = pickConcept(chosenDimension, input.mentalModel);

  return {
    dimension: chosenDimension,
    concept,
    probeType,
    difficulty,
    isClarification: false,
    reason: `"${chosenDimension}" is the highest-uncertainty dimension still within budget (confidence=${input.dimensions[chosenDimension].confidence}); selected "${probeType}" (rung: "${difficulty}").`,
  };
}
