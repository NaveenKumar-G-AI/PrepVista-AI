import { EvidenceBundle, Forecast, InterventionOutcome, StudentTarget, TrajectoryPoint } from '../types';

/**
 * SS7 Data Sources, SS28-SS33 Feature Integration.
 *
 * These interfaces are the CONTRACT Feature 10 needs from the rest of
 * ACEAPT. Field names/shapes below are a reasonable default - rename
 * to match your actual Feature 3/5/6/7/8/9 services; the *shapes*
 * matter far more than the exact names. Nothing in engines/ or api/
 * depends on how these are implemented, only on this interface, so
 * swapping DemoAdapter for real services is a one-file change.
 */

export interface Feature6ReadinessAdapter {
  /** Feature 6 owns readiness assessment; Feature 10 only reads its history. SS32. */
  getReadinessHistory(studentId: string): Promise<TrajectoryPoint[]>;
}

export interface Feature5And8SkillAdapter {
  /** Feature 5 training activity + Feature 8 verified mastery, per skill. SS29, SS30. */
  getSkillTrajectories(studentId: string): Promise<Record<string, TrajectoryPoint[]>>;
  getPracticeScores(studentId: string): Promise<Record<string, number>>;
  getTransferScores(studentId: string): Promise<Record<string, number>>;
  getRetentionSignal(studentId: string): Promise<{ gapDays: number | null; retrievalDeclineDetected: boolean }>;
}

export interface Feature9SimulationAdapter {
  /** Feature 9 realistic simulation evidence. SS31. */
  getSimulationScores(studentId: string): Promise<Record<string, number>>;
  getSimulationTimeRatios(studentId: string): Promise<Record<string, number>>;
  getLateSessionDeclineRatio(studentId: string): Promise<number | null>;
}

export interface Feature7SignalSink {
  /** SS28 - push structured signals; Feature 7 decides what to do with them. */
  pushSignals(studentId: string, forecast: Forecast): Promise<void>;
}

export interface Feature3LongTermSink {
  /** SS33 - long-term evidence returns to Student Intelligence. */
  recordLongTermEvidence(studentId: string, forecast: Forecast): Promise<void>;
}

export interface TargetSource {
  getCurrentTarget(studentId: string): Promise<StudentTarget | null>;
}

export interface ActivitySource {
  getLastActiveAt(studentId: string): Promise<string | null>;
  getInterventionHistory(studentId: string): Promise<InterventionOutcome[]>;
}

/** The composed contract the forecast engine + API layer depend on. */
export interface Adapters
  extends Feature6ReadinessAdapter,
    Feature5And8SkillAdapter,
    Feature9SimulationAdapter,
    Feature7SignalSink,
    Feature3LongTermSink,
    TargetSource,
    ActivitySource {
  buildEvidenceBundle(studentId: string): Promise<EvidenceBundle>;
}

/**
 * Default bundle builder - composes the individual adapter calls into
 * one EvidenceBundle. Reuse this in real adapters instead of
 * duplicating the assembly logic.
 */
export async function defaultBuildEvidenceBundle(
  studentId: string,
  a: Omit<Adapters, 'buildEvidenceBundle'>
): Promise<EvidenceBundle> {
  const [
    readinessHistory,
    skillHistory,
    practiceScores,
    transferScores,
    retention,
    simulationScores,
    simulationTimeRatios,
    lateSessionDeclineRatio,
    target,
    lastActiveAt,
    interventionHistory,
  ] = await Promise.all([
    a.getReadinessHistory(studentId),
    a.getSkillTrajectories(studentId),
    a.getPracticeScores(studentId),
    a.getTransferScores(studentId),
    a.getRetentionSignal(studentId),
    a.getSimulationScores(studentId),
    a.getSimulationTimeRatios(studentId),
    a.getLateSessionDeclineRatio(studentId),
    a.getCurrentTarget(studentId),
    a.getLastActiveAt(studentId),
    a.getInterventionHistory(studentId),
  ]);

  return {
    studentId,
    readinessHistory,
    skillHistory,
    practiceScores,
    transferScores,
    simulationScores,
    simulationTimeRatios,
    lateSessionDeclineRatio,
    retentionGapDays: retention.gapDays,
    retrievalDeclineDetected: retention.retrievalDeclineDetected,
    interventionHistory,
    target,
    lastActiveAt,
  };
}
