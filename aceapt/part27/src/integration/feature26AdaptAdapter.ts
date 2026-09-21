/**
 * Feature 27 never generates its own intervention content — it hands the
 * highest-impact gap to Feature 26 (Adapt) and lets that system decide the
 * actual practice plan (spec section 33: "Feature 27 should not become
 * another isolated dashboard"). This is a command-style interface (write, not
 * read) which is why it's separate from PlatformEvidenceGateway.
 *
 * MockFeature26AdaptAdapter below is a stand-in that shapes a plausible plan
 * from the focus dimension, purely so the closed loop (section 34) can be
 * demonstrated end to end without a real Feature 26 to call. Replace with a
 * real call into Feature 26's API/queue.
 */
import type { CapabilityDimensionKey } from "../domain/types.js";

export interface InterventionStep {
  title: string;
  minutes: number;
}

export interface InterventionPlan {
  planId: string;
  studentId: string;
  createdAt: string;
  focusDimension: CapabilityDimensionKey | null;
  steps: InterventionStep[];
  totalMinutes: number;
}

export interface RequestInterventionInput {
  studentId: string;
  focusDimension: CapabilityDimensionKey | null;
  riskExplanation: string;
}

export interface Feature26AdaptAdapter {
  requestIntervention(input: RequestInterventionInput): Promise<InterventionPlan>;
}

const STEP_TEMPLATES: Partial<Record<CapabilityDimensionKey, InterventionStep[]>> = {
  transfer: [
    { title: "Transfer repair — apply known concepts to novel problems", minutes: 7 },
    { title: "Timed challenge — same concepts, added time pressure", minutes: 8 },
    { title: "Verification — confirm the gap has closed", minutes: 5 },
  ],
  speed: [
    { title: "Speed drill — familiar problems, tightened pacing", minutes: 6 },
    { title: "Mixed-pace set — alternate quick and standard pacing", minutes: 9 },
    { title: "Verification — timed check against target pace", minutes: 5 },
  ],
  consistency: [
    { title: "Repeat-topic set — same concept, varied surface form", minutes: 7 },
    { title: "Error review — walk back through recent misses", minutes: 6 },
    { title: "Verification — a second pass to check for repeat errors", minutes: 5 },
  ],
  retention: [
    { title: "Spaced review — concepts flagged for decay", minutes: 8 },
    { title: "Recall check — no notes, cold retrieval", minutes: 6 },
    { title: "Verification — confirm recall held up", minutes: 4 },
  ],
  mastery: [
    { title: "Concept reinforcement on the weakest topic", minutes: 8 },
    { title: "Applied practice set", minutes: 8 },
    { title: "Verification", minutes: 5 },
  ],
  accuracy: [
    { title: "Targeted accuracy set on recent error patterns", minutes: 8 },
    { title: "Applied practice, untimed", minutes: 7 },
    { title: "Verification", minutes: 5 },
  ],
};

const DEFAULT_STEPS: InterventionStep[] = [
  { title: "Targeted practice on the current highest-impact gap", minutes: 10 },
  { title: "Verification", minutes: 5 },
];

export class MockFeature26AdaptAdapter implements Feature26AdaptAdapter {
  async requestIntervention(input: RequestInterventionInput): Promise<InterventionPlan> {
    const steps =
      (input.focusDimension ? STEP_TEMPLATES[input.focusDimension] : undefined) ?? DEFAULT_STEPS;
    return {
      planId: `plan_${Math.random().toString(36).slice(2, 10)}`,
      studentId: input.studentId,
      createdAt: new Date().toISOString(),
      focusDimension: input.focusDimension,
      steps,
      totalMinutes: steps.reduce((sum, s) => sum + s.minutes, 0),
    };
  }
}
