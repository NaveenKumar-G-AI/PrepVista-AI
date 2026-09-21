/**
 * Root-cause taxonomy for Feature 16 (Adaptive Learning Intervention & Recovery Engine).
 *
 * If your existing repository already defines an equivalent taxonomy (e.g. inside
 * Feature 12), treat this file as the contract to reconcile with — do not run both
 * in parallel. Rename/re-map here rather than introducing a second source of truth.
 */

export enum RootCause {
  CONCEPT_GAP = 'CONCEPT_GAP',
  PREREQUISITE_GAP = 'PREREQUISITE_GAP',
  PROCEDURAL_GAP = 'PROCEDURAL_GAP',
  STRATEGY_GAP = 'STRATEGY_GAP',
  APPLICATION_GAP = 'APPLICATION_GAP',
  TRANSFER_GAP = 'TRANSFER_GAP',
  CALCULATION_ERROR = 'CALCULATION_ERROR',
  INTERPRETATION_ERROR = 'INTERPRETATION_ERROR',
  SPEED_GAP = 'SPEED_GAP',
  RETENTION_GAP = 'RETENTION_GAP',
  CONSISTENCY_GAP = 'CONSISTENCY_GAP',
  ASSESSMENT_CONDITION_GAP = 'ASSESSMENT_CONDITION_GAP',
  MULTI_FACTOR = 'MULTI_FACTOR',
}

/**
 * "Treat causes rather than symptoms." When more than one cause is plausible,
 * this fixed order decides which one gets addressed first. Foundations before
 * symptoms: e.g. a PROCEDURAL_GAP outranks a SPEED_GAP, because slowness caused
 * by weak fluency should be repaired before timed drills are introduced.
 *
 * This list is intentionally a plain array (not buried in logic) so it can be
 * reviewed and re-ordered by a learning-science owner without touching engine code.
 */
export const ROOT_CAUSE_PRIORITY: readonly RootCause[] = [
  RootCause.PREREQUISITE_GAP,
  RootCause.CONCEPT_GAP,
  RootCause.PROCEDURAL_GAP,
  RootCause.STRATEGY_GAP,
  RootCause.APPLICATION_GAP,
  RootCause.TRANSFER_GAP,
  RootCause.INTERPRETATION_ERROR,
  RootCause.CALCULATION_ERROR,
  RootCause.CONSISTENCY_GAP,
  RootCause.SPEED_GAP,
  RootCause.RETENTION_GAP,
  RootCause.ASSESSMENT_CONDITION_GAP,
];

export enum Confidence {
  HIGH = 'HIGH',
  MODERATE = 'MODERATE',
  LOW = 'LOW',
}

/**
 * A single candidate cause produced by the diagnostic engine. `evidenceSummary`
 * must only ever describe evidence that was actually present on the attempt —
 * the engine must never fabricate a rationale for a confidence level it doesn't have.
 */
export interface RootCauseCandidate {
  cause: RootCause;
  confidence: Confidence;
  evidenceSummary: string;
}

export const ROOT_CAUSE_LABELS: Record<RootCause, string> = {
  [RootCause.CONCEPT_GAP]: 'Concept gap',
  [RootCause.PREREQUISITE_GAP]: 'Prerequisite gap',
  [RootCause.PROCEDURAL_GAP]: 'Procedural gap',
  [RootCause.STRATEGY_GAP]: 'Strategy selection gap',
  [RootCause.APPLICATION_GAP]: 'Application gap',
  [RootCause.TRANSFER_GAP]: 'Transfer gap',
  [RootCause.CALCULATION_ERROR]: 'Calculation error',
  [RootCause.INTERPRETATION_ERROR]: 'Interpretation error',
  [RootCause.SPEED_GAP]: 'Speed gap',
  [RootCause.RETENTION_GAP]: 'Retention gap',
  [RootCause.CONSISTENCY_GAP]: 'Consistency gap',
  [RootCause.ASSESSMENT_CONDITION_GAP]: 'Assessment-condition gap',
  [RootCause.MULTI_FACTOR]: 'Multiple contributing factors',
};
