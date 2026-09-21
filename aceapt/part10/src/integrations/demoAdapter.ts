import { Adapters, defaultBuildEvidenceBundle } from './adapters';
import { EvidenceBundle, Forecast, InterventionOutcome, StudentTarget, TrajectoryPoint } from '../types';

/**
 * DEMO / SEED DATA ONLY - SS66 "No Fake Data".
 *
 * Reproduces the Startupthon narrative from SS63 (readiness 67 -> 81,
 * target 85, time management 51 -> 74, DI 70 -> 79, endurance 58 -> 76)
 * so the engine can run end-to-end without a live Features 3-9 backend.
 *
 * NEVER wire this into a production build. Implement `Adapters` against
 * your real Feature 3/5/6/7/8/9 services instead - see adapters.ts for
 * the exact contract this class fulfills.
 */
export class DemoAdapter implements Adapters {
  private state: 'BEFORE' | 'AFTER' = 'BEFORE';
  private pushedSignals: { studentId: string; forecast: Forecast }[] = [];

  /** Simulates the Feature 7 -> Feature 5 -> Feature 8 -> Feature 9 loop completing. */
  advanceToAfterIntervention() {
    this.state = 'AFTER';
  }

  getPushedSignals() {
    return this.pushedSignals;
  }

  async getReadinessHistory(): Promise<TrajectoryPoint[]> {
    const base: TrajectoryPoint[] = [
      pt('readiness', 58, -35),
      pt('readiness', 61, -28),
      pt('readiness', 64, -21),
      pt('readiness', 65, -14),
      pt('readiness', 67, -7),
      pt('readiness', 67, 0),
    ];
    if (this.state === 'BEFORE') return base;
    return [...base, pt('readiness', 74, 5), pt('readiness', 78, 10), pt('readiness', 81, 14)];
  }

  async getSkillTrajectories(): Promise<Record<string, TrajectoryPoint[]>> {
    const timeManagement =
      this.state === 'BEFORE'
        ? [pt('time_management', 55, -21), pt('time_management', 53, -14), pt('time_management', 52, -7), pt('time_management', 51, 0)]
        : [
            pt('time_management', 51, 0),
            pt('time_management', 60, 5),
            pt('time_management', 68, 10),
            pt('time_management', 74, 14),
          ];

    const dataInterpretation =
      this.state === 'BEFORE'
        ? [pt('data_interpretation', 74, -21), pt('data_interpretation', 71, -14), pt('data_interpretation', 70, -7), pt('data_interpretation', 70, 0)]
        : [
            pt('data_interpretation', 70, 0),
            pt('data_interpretation', 73, 5),
            pt('data_interpretation', 76, 10),
            pt('data_interpretation', 79, 14),
          ];

    const arithmetic = [pt('arithmetic', 70, -14), pt('arithmetic', 71, -7), pt('arithmetic', 72, 0)];
    const logicalReasoning = [pt('logical_reasoning', 82, -14), pt('logical_reasoning', 85, -7), pt('logical_reasoning', 88, 0)];

    return {
      time_management: timeManagement,
      data_interpretation: dataInterpretation,
      arithmetic,
      logical_reasoning: logicalReasoning,
    };
  }

  async getPracticeScores(): Promise<Record<string, number>> {
    return { data_interpretation: 92, arithmetic: 88, logical_reasoning: 90 };
  }

  async getTransferScores(): Promise<Record<string, number>> {
    return this.state === 'BEFORE'
      ? { data_interpretation: 68, arithmetic: 79, logical_reasoning: 84 }
      : { data_interpretation: 79, arithmetic: 81, logical_reasoning: 86 };
  }

  async getRetentionSignal() {
    return { gapDays: this.state === 'BEFORE' ? 9 : 4, retrievalDeclineDetected: false };
  }

  async getSimulationScores(): Promise<Record<string, number>> {
    return this.state === 'BEFORE'
      ? { data_interpretation: 64, time_management: 58, endurance: 58 }
      : { data_interpretation: 79, time_management: 74, endurance: 76 };
  }

  async getSimulationTimeRatios(): Promise<Record<string, number>> {
    return this.state === 'BEFORE' ? { data_interpretation: 1.34, arithmetic: 1.05 } : { data_interpretation: 1.08, arithmetic: 1.02 };
  }

  async getLateSessionDeclineRatio(): Promise<number | null> {
    return this.state === 'BEFORE' ? 0.17 : 0.06;
  }

  async pushSignals(studentId: string, forecast: Forecast): Promise<void> {
    this.pushedSignals.push({ studentId, forecast });
  }

  async recordLongTermEvidence(): Promise<void> {
    // SS33 - in a real implementation, write to Feature 3's store.
  }

  async getCurrentTarget(studentId: string): Promise<StudentTarget | null> {
    return {
      id: 'target_demo_1',
      studentId,
      targetScore: 85,
      assessmentType: 'Placement Aptitude',
      targetDate: inDays(14).toISOString(),
    };
  }

  async getLastActiveAt(): Promise<string | null> {
    return new Date().toISOString();
  }

  async getInterventionHistory(): Promise<InterventionOutcome[]> {
    if (this.state === 'BEFORE') return [];
    return [
      {
        studentId: 'demo_student',
        interventionId: 'iv_timed_di_practice',
        interventionType: 'Timed DI Practice',
        beforeValue: 61,
        afterValue: 74,
        response: 'HIGH_RESPONSE',
        confidence: 0.8,
      },
    ];
  }

  async buildEvidenceBundle(studentId: string): Promise<EvidenceBundle> {
    return defaultBuildEvidenceBundle(studentId, this);
  }
}

function pt(metric: string, value: number, dayOffset: number): TrajectoryPoint {
  return { studentId: 'demo_student', metric, value, timestamp: inDays(dayOffset).toISOString() };
}

function inDays(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}
