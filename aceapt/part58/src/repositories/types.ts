/**
 * Repository interfaces. Services depend on these, never on `pg` directly, so
 * tests can use simple in-memory fakes (see tests/fakes.ts) and so swapping
 * the storage engine later doesn't touch business logic.
 */
import type {
  CalibrationSnapshot,
  DecisionAction,
  DecisionAggregateStats,
  DecisionEvent,
  DecisionEventInput,
  DecisionInsight,
  DecisionPolicy,
  NewCalibrationSnapshot,
  NewDecisionInsight,
  NewDecisionPolicy,
  NewTrainingScenario,
  TrainingMode,
  TrainingScenario,
} from '../types';

export interface ListDecisionEventsOptions {
  limit?: number;
  before?: string; // ISO timestamp cursor
  since?: string; // ISO timestamp
  assessmentId?: string;
  action?: DecisionAction;
}

export interface DecisionEventRepository {
  create(event: DecisionEventInput): Promise<DecisionEvent>;
  findById(tenantId: string, id: string): Promise<DecisionEvent | null>;
  listByStudent(tenantId: string, studentId: string, opts?: ListDecisionEventsOptions): Promise<DecisionEvent[]>;
  updateOutcomeAndQuality(
    tenantId: string,
    id: string,
    outcome: { isCorrect: boolean | null },
    quality: DecisionEvent['decisionQuality']
  ): Promise<DecisionEvent | null>;
  aggregateForStudent(
    tenantId: string,
    studentId: string,
    opts?: { since?: string }
  ): Promise<DecisionAggregateStats & { sampleSize: number }>;
}

export interface DecisionPolicyRepository {
  upsertVersion(policy: NewDecisionPolicy): Promise<DecisionPolicy>;
  getLatest(tenantId: string, assessmentVersionId: string): Promise<DecisionPolicy | null>;
  getVersion(tenantId: string, assessmentVersionId: string, version: number): Promise<DecisionPolicy | null>;
}

export interface DecisionInsightRepository {
  create(insight: NewDecisionInsight): Promise<DecisionInsight>;
  listForStudent(tenantId: string, studentId: string, opts?: { limit?: number }): Promise<DecisionInsight[]>;
}

export interface CalibrationRepository {
  upsertSnapshot(snapshot: NewCalibrationSnapshot): Promise<CalibrationSnapshot>;
  listForStudent(tenantId: string, studentId: string): Promise<CalibrationSnapshot[]>;
}

export interface ScenarioRepository {
  create(scenario: NewTrainingScenario): Promise<TrainingScenario>;
  findById(tenantId: string, id: string): Promise<TrainingScenario | null>;
  findServable(tenantId: string, mode: TrainingMode, difficultyLevel: number): Promise<TrainingScenario | null>;
  markValidated(id: string, status: 'VALIDATED' | 'REJECTED'): Promise<void>;
}
