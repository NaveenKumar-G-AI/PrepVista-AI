import type { ReadinessDimensionKey } from "../domain/types.js";
import type { ConceptMasteryHint } from "../engines/dimensionScoring.js";

// None of Features 8, 9, 10, or 12's real implementations are available in
// this session (Section 60 requires inspecting the existing codebase first —
// there wasn't one to inspect here; see README "Integration Guide"). Rather
// than fabricate their internals, each integration point is a narrow
// interface plus a mock that's honest about being a stand-in. Swap the mock
// for a real client without touching the readiness/simulation engines —
// nothing in src/engines or src/simulation imports these mocks directly,
// only the API layer does.

// ---------------------------------------------------------------------------
// Feature 8 — Mastery verification (Section 28)
// "A student can master a topic but still struggle under time pressure."
// Feature 13's `concept` dimension SHOULD read Feature 8's mastery signal.
// ---------------------------------------------------------------------------

export interface Feature8Client {
  getConceptMastery(studentId: string): Promise<ConceptMasteryHint | null>;
}

/** Always defers to Feature 13's own topic-practice fallback (see
 * dimensionScoring.ts) by returning null. Replace with a real call to
 * Feature 8's mastery endpoint. */
export class MockFeature8Client implements Feature8Client {
  async getConceptMastery(_studentId: string): Promise<ConceptMasteryHint | null> {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Feature 10 — Trajectory forecast (Section 27)
// CURRENT READINESS (Feature 13) + TRAJECTORY (Feature 10) + CONFIDENCE
// = more complete readiness intelligence. Feature 13 never predicts the
// future itself — it only reports current, evidenced state.
// ---------------------------------------------------------------------------

export interface TrajectoryForecast {
  forecastedReadinessScore: number;
  forecastDate: string;
  basis: string;
}

export interface Feature10Client {
  getTrajectoryForecast(studentId: string): Promise<TrajectoryForecast | null>;
}

/** Returns null (no forecast available) — the API surfaces `trajectory:
 * null` rather than inventing a forecast Feature 13 has no business making. */
export class MockFeature10Client implements Feature10Client {
  async getTrajectoryForecast(_studentId: string): Promise<TrajectoryForecast | null> {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Feature 12 — Intervention engine (Section 26)
// Feature 13 identifies WHAT is preventing readiness; Feature 12 decides
// WHAT INTERVENTION to use. The mapping below is illustrative only — a real
// Feature 12 would weigh student history, current load, spacing, and more.
// ---------------------------------------------------------------------------

export interface InterventionRecommendation {
  interventionType: string;
  description: string;
}

export interface Feature12Client {
  recommendIntervention(input: {
    studentId: string;
    gapDimensionKey: ReadinessDimensionKey;
    evidenceSummary: string;
  }): Promise<InterventionRecommendation | null>;
}

const ILLUSTRATIVE_MAPPING: Record<ReadinessDimensionKey, InterventionRecommendation> = {
  concept: { interventionType: "CONCEPT_REVIEW", description: "Targeted concept review on the weakest topics." },
  accuracy: { interventionType: "TARGETED_CONCEPT_REVIEW", description: "Focused review + re-practice on the topics driving accuracy loss." },
  speed: { interventionType: "SPEED_DRILL", description: "Short, repeated drills at expected-time pace to build automaticity." },
  time_pressure: { interventionType: "TIMED_DRILL", description: "Timed mixed-question sets to close the untimed-vs-timed accuracy gap." },
  mixed_topic: { interventionType: "MIXED_PRACTICE", description: "Rapid topic-switching practice sets." },
  novel_question: { interventionType: "NOVEL_QUESTION_EXPOSURE", description: "Practice sets weighted toward unseen question variants." },
  retention: { interventionType: "SPACED_REVIEW", description: "Spaced-repetition review of topics showing decay." },
  consistency: { interventionType: "REPEATED_SIMULATION", description: "Additional realistic simulations to stabilize performance." },
  assessment_condition: { interventionType: "FULL_MOCK_CYCLE", description: "A full realistic mock cycle under exam conditions." },
  recovery: { interventionType: "ERROR_RECOVERY_DRILL", description: "Drills that deliberately follow a wrong answer with more questions, to build recovery habits." },
  question_selection: { interventionType: "TRIAGE_STRATEGY_COACHING", description: "Coaching on solve/skip/return decision-making." },
  time_allocation: { interventionType: "TIME_BUDGETING_DRILL", description: "Practice enforcing a per-question time budget." },
};

export class MockFeature12Client implements Feature12Client {
  async recommendIntervention(input: {
    studentId: string;
    gapDimensionKey: ReadinessDimensionKey;
    evidenceSummary: string;
  }): Promise<InterventionRecommendation | null> {
    return ILLUSTRATIVE_MAPPING[input.gapDimensionKey] ?? null;
  }
}
