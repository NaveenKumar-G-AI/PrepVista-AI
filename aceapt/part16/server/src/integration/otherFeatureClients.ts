/**
 * ============================================================================
 * INTEGRATION POINT: Feature 12 (Personalized Intervention & Learning
 * Transformation — "intervention intelligence")
 * ============================================================================
 * Per Section 29, Feature 12 determines intervention INTELLIGENCE and Feature
 * 16 operationalizes/orchestrates delivery — Feature 16 must not duplicate
 * Feature 12. Since Feature 12 is not part of this codebase, the diagnostic +
 * selection logic in engine/ stands in for it for this prototype. If your
 * repository already has Feature 12, this is the seam to wire it through:
 * call it here first, and let engine/diagnosticEngine.ts + interventionSelector.ts
 * extend/refine its output rather than compete with it.
 */
export interface InterventionSignal {
  suggestedFocus?: string;
  confidence?: 'high' | 'moderate' | 'low';
}

export async function getInterventionSignal(_studentId: string, _skillId: string): Promise<InterventionSignal | null> {
  // TODO(integration): if Feature 12 exists, call it here and merge its signal
  // into diagnosticEngine.diagnose() rather than only using local evidence.
  return null;
}

/**
 * ============================================================================
 * INTEGRATION POINT: Feature 13 (Continuous Readiness & Exam-Condition
 * Performance)
 * ============================================================================
 * Section 32: if the problem is performance under realistic assessment
 * conditions, Feature 16 routes to Feature 13's readiness mechanisms instead
 * of re-teaching concepts.
 */
export async function routeToExamSimulation(studentId: string, skillIds: string[]): Promise<{ routed: boolean; note: string }> {
  // TODO(integration): replace with a real call to Feature 13, e.g.
  //   return feature13ApiClient.startExamSimulation(studentId, skillIds);
  return {
    routed: true,
    note: `Routed to exam-simulation readiness flow for skills: ${skillIds.join(', ')} (Feature 13 integration point).`,
  };
}

/**
 * ============================================================================
 * INTEGRATION POINT: Feature 11 (Learning Behavior Intelligence)
 * ============================================================================
 * Section 33: behavioral signals must be phrased neutrally — never as a
 * judgment of the student (e.g. "recent activity is inconsistent", never
 * "the student is lazy").
 */
export interface BehavioralSignalSummary {
  label: string;
}

export async function getBehavioralSummary(_studentId: string): Promise<BehavioralSignalSummary | null> {
  // TODO(integration): replace with a real call to Feature 11.
  return null;
}

/**
 * ============================================================================
 * INTEGRATION POINT: Feature 10 (Trajectory / Forecast Intelligence)
 * ============================================================================
 * Section 34: repeated intervention failure that changes trajectory should be
 * surfaced to Feature 10 so forecasts can be recalculated.
 */
export async function updateTrajectorySignal(
  studentId: string,
  skillId: string,
  signal: 'repeated_failure' | 'resolved'
): Promise<void> {
  // TODO(integration): replace with a real call to Feature 10, e.g.
  //   return feature10ApiClient.updateTrajectorySignal(studentId, skillId, signal);
  // eslint-disable-next-line no-console
  console.log(`[feature10Client] trajectory signal for ${studentId}/${skillId}: ${signal}`);
}
