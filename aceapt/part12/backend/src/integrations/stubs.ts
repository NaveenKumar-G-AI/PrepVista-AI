import { StudentState, BehaviorSignal } from '../domain/types';

/**
 * ============================================================================
 * INTEGRATION STUBS
 * ============================================================================
 * No existing PrepVista/ACEAPT repository was available when this was built,
 * so Features 5 and 7-11 don't exist yet in this workspace. Rather than
 * invent their internals (explicitly forbidden — Section 77), each one is
 * represented as a small interface plus a clearly-labelled placeholder
 * implementation. Swap the placeholder for a real call into the actual
 * service once it exists; nothing in engine/*.ts or api/routes.ts needs to
 * change, because Feature 12 only ever depends on these interfaces.
 * ============================================================================
 */

// Feature 5 — Training delivery. Feature 12 decides WHAT intervention type to
// run; Feature 5 is responsible for HOW it's delivered (the actual question
// content). This prototype's InterventionRunner UI stands in for Feature 5's
// delivery layer by asking the student to report a result in the same shape
// Feature 5 would report it (Section 34: keep this separation).
export interface TrainingDeliveryAdapter {
  describeDelivery(type: string): string;
}
export const feature5Stub: TrainingDeliveryAdapter = {
  describeDelivery: type => `Feature 5 would deliver the actual ${type} question content here.`
};

// Feature 7 — Adaptive planner / next-best learning action.
export interface AdaptivePlannerAdapter {
  notifyInterventionOutcome(studentId: string, summary: string): void;
}
export const feature7Stub: AdaptivePlannerAdapter = {
  notifyInterventionOutcome: (studentId, summary) => {
    // eslint-disable-next-line no-console
    console.log(`[Feature7 stub] would feed plan for ${studentId}: ${summary}`);
  }
};

// Feature 8 — Mastery verification. Feature 12 never claims mastery itself
// (Section 61: "Do not claim mastery unless Feature 8 verifies it").
export interface MasteryVerificationAdapter {
  isMasteryVerified(studentId: string, topic: string): boolean | 'unavailable';
}
export const feature8Stub: MasteryVerificationAdapter = {
  isMasteryVerified: () => 'unavailable'
};

// Feature 9 — Realistic simulation. Simulation failures can feed problem
// detection (this prototype already treats 'simulation' as an AttemptMode
// directly in recentPerformance rather than fetching it separately).
export interface SimulationAdapter {
  getRecentSimulationAccuracy(studentId: string, topic: string): number | 'unavailable';
}
export const feature9Stub: SimulationAdapter = {
  getRecentSimulationAccuracy: () => 'unavailable'
};

// Feature 10 — Readiness / trajectory forecasting.
// PLACEHOLDER HEURISTIC ONLY: a recency-weighted average of recent topic
// accuracy, standing in for the real forecasting model. Good enough to show
// the readiness needle move after an intervention outcome, not good enough
// to trust for a real trajectory forecast.
export interface ForecastAdapter {
  recalculateReadiness(state: StudentState): number | 'unavailable';
}
export const feature10Stub: ForecastAdapter = {
  recalculateReadiness: state => {
    if (state.recentPerformance.length === 0) return 'unavailable';
    const sorted = [...state.recentPerformance].sort(
      (a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime()
    );
    const recent = sorted.slice(0, 10);
    const weighted = recent.reduce((sum, a, i) => sum + a.accuracyPct * (recent.length - i), 0);
    const weightSum = recent.reduce((sum, _a, i) => sum + (recent.length - i), 0);
    return Math.round(weighted / weightSum);
  }
};

// Feature 11 — Learning behaviour and consistency intelligence.
export interface BehaviorAdapter {
  getBehaviorProfile(studentId: string): BehaviorSignal[] | 'unavailable';
}
export const feature11Stub: BehaviorAdapter = {
  // In this prototype, behaviour signals live directly on the seeded student
  // state (data/seed.ts) rather than being fetched live, since there is no
  // Feature 11 service to call yet.
  getBehaviorProfile: () => 'unavailable'
};
