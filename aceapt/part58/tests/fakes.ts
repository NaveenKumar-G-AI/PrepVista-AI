import { randomUUID } from 'node:crypto';
import type {
  CalibrationRepository,
  DecisionEventRepository,
  ListDecisionEventsOptions,
} from '../src/repositories/types';
import type {
  CalibrationSnapshot,
  DecisionAggregateStats,
  DecisionEvent,
  DecisionEventInput,
  DecisionQualityProfile,
  NewCalibrationSnapshot,
} from '../src/types';

export class FakeDecisionEventRepository implements DecisionEventRepository {
  public events: DecisionEvent[] = [];

  async create(event: DecisionEventInput): Promise<DecisionEvent> {
    const existing = this.events.find((e) => e.tenantId === event.tenantId && e.idempotencyKey === event.idempotencyKey);
    if (existing) return existing;
    const created: DecisionEvent = {
      ...event,
      id: randomUUID(),
      isCorrect: null,
      decisionQuality: null,
      createdAt: new Date().toISOString(),
      decidedAt: new Date().toISOString(),
    };
    this.events.push(created);
    return created;
  }

  async findById(tenantId: string, id: string): Promise<DecisionEvent | null> {
    return this.events.find((e) => e.tenantId === tenantId && e.id === id) ?? null;
  }

  async listByStudent(tenantId: string, studentId: string, opts: ListDecisionEventsOptions = {}): Promise<DecisionEvent[]> {
    let result = this.events.filter((e) => e.tenantId === tenantId && e.studentId === studentId);
    if (opts.action) result = result.filter((e) => e.action === opts.action);
    if (opts.assessmentId) result = result.filter((e) => e.assessmentId === opts.assessmentId);
    return result.slice(0, opts.limit ?? 50);
  }

  async updateOutcomeAndQuality(
    tenantId: string,
    id: string,
    outcome: { isCorrect: boolean | null },
    quality: DecisionQualityProfile | null
  ): Promise<DecisionEvent | null> {
    const event = this.events.find((e) => e.tenantId === tenantId && e.id === id);
    if (!event) return null;
    event.isCorrect = outcome.isCorrect;
    event.decisionQuality = quality;
    return event;
  }

  async aggregateForStudent(tenantId: string, studentId: string): Promise<DecisionAggregateStats & { sampleSize: number }> {
    const events = this.events.filter((e) => e.tenantId === tenantId && e.studentId === studentId);
    const uncertain = events.filter((e) => e.uncertaintyState && ['UNCERTAIN', 'LOW_CONFIDENCE', 'NO_USEFUL_EVIDENCE'].includes(e.uncertaintyState));
    const blind = uncertain.filter((e) => e.action === 'BLIND_GUESS');
    const eliminate = uncertain.filter((e) => e.action === 'ELIMINATE');
    const overruns = uncertain.filter((e) => e.questionExpectedTimeSeconds && e.elapsedTimeSeconds > e.questionExpectedTimeSeconds * 1.5);
    const switches = events.filter((e) => e.answerChanged);
    const unsupportedSwitches = switches.filter((e) => !e.evidenceUsed.some((s) => s.type === 'NEW_EVIDENCE_FOR_SWITCH'));

    return {
      totalUncertainDecisions: uncertain.length,
      blindGuessRate: uncertain.length ? blind.length / uncertain.length : 0,
      eliminationRate: uncertain.length ? eliminate.length / uncertain.length : 0,
      strategicSkipRate: 0,
      potentiallyUnnecessarySkipRate: 0,
      timeOverrunRate: uncertain.length ? overruns.length / uncertain.length : 0,
      unsupportedSwitchRate: switches.length ? unsupportedSwitches.length / switches.length : 0,
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
      sampleSize: uncertain.length,
    };
  }
}

export class FakeCalibrationRepository implements CalibrationRepository {
  public snapshots: CalibrationSnapshot[] = [];

  async upsertSnapshot(snapshot: NewCalibrationSnapshot): Promise<CalibrationSnapshot> {
    const created: CalibrationSnapshot = { ...snapshot, id: randomUUID(), computedAt: new Date().toISOString() };
    this.snapshots = this.snapshots.filter(
      (s) => !(s.tenantId === created.tenantId && s.studentId === created.studentId && s.confidenceBand === created.confidenceBand)
    );
    this.snapshots.push(created);
    return created;
  }

  async listForStudent(tenantId: string, studentId: string): Promise<CalibrationSnapshot[]> {
    return this.snapshots.filter((s) => s.tenantId === tenantId && s.studentId === studentId);
  }
}

export function baseDecisionEventInput(overrides: Partial<DecisionEventInput> = {}): DecisionEventInput {
  return {
    tenantId: 'tenant-1',
    studentId: 'student-1',
    assessmentId: 'assessment-1',
    assessmentVersionId: null,
    questionVersionId: 'question-1',
    attemptId: null,
    context: 'TRAINING',
    action: 'ELIMINATE',
    uncertaintyState: 'UNCERTAIN',
    confidenceBand: 'MEDIUM',
    confidenceProbability: null,
    evidenceUsed: [],
    eliminatedOptionIds: [],
    totalOptions: 4,
    questionExpectedTimeSeconds: 60,
    studentExpectedTimeSeconds: null,
    elapsedTimeSeconds: 50,
    remainingTestTimeSeconds: 600,
    scoringPolicyVersionId: null,
    initialOptionId: null,
    finalOptionId: null,
    answerChanged: false,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}
