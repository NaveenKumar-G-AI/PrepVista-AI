/**
 * GuessingIntelligenceService (§129, §131). Single entry point the API layer
 * calls into — composes the other 8 services. Kept thin on purpose: this
 * class orchestrates, it doesn't contain decision logic itself (that lives in
 * domain/* and the individual services).
 */
import type { DecisionEventRepository } from '../repositories/types';
import type {
  DecisionAggregateStats,
  DecisionEvent,
  DecisionEventInput,
  DecisionInsight,
  DecisionPolicy,
  TrainingMode,
  TrainingScenario,
} from '../types';
import type { AnswerSwitchService, SwitchQualityBreakdown, SwitchSupport } from './answerSwitchService';
import type { ConfidenceCalibrationService } from './confidenceCalibrationService';
import type { DecisionInsightService } from './decisionInsightService';
import type { DecisionPolicyService } from './decisionPolicyService';
import type { DecisionTrainingService, SubmitDecisionResult } from './decisionTrainingService';
import type { SkipAnalysis, StrategicSkippingService } from './strategicSkippingService';
import type { Misalignment } from '../domain/calibration';

export interface DecisionProfile {
  studentId: string;
  /** Only dimensions with enough evidence are included — §109 "only show measured capabilities". */
  dimensions: Partial<Record<
    'elimination' | 'informedGuessing' | 'blindGuessing' | 'strategicSkipping' | 'timeAllocation' | 'confidenceCalibration' | 'answerSwitching',
    { label: 'STRONG' | 'DEVELOPING' | 'NEEDS_ATTENTION'; sampleSize: number }
  >>;
  sampleSize: number;
}

const MIN_SAMPLE_FOR_PROFILE_DIMENSION = 8;

function rateRate(rate: number, goodWhenLow: boolean): 'STRONG' | 'DEVELOPING' | 'NEEDS_ATTENTION' {
  const effective = goodWhenLow ? rate : 1 - rate;
  if (effective <= 0.25) return 'STRONG';
  if (effective <= 0.5) return 'DEVELOPING';
  return 'NEEDS_ATTENTION';
}

export class GuessingIntelligenceService {
  constructor(
    private readonly deps: {
      events: DecisionEventRepository;
      policies: DecisionPolicyService;
      training: DecisionTrainingService;
      calibration: ConfidenceCalibrationService;
      skipping: StrategicSkippingService;
      switching: AnswerSwitchService;
      insights: DecisionInsightService;
    }
  ) {}

  async getDecisionProfile(tenantId: string, studentId: string): Promise<DecisionProfile> {
    const agg: DecisionAggregateStats & { sampleSize: number } = await this.deps.events.aggregateForStudent(tenantId, studentId);
    const dimensions: DecisionProfile['dimensions'] = {};

    if (agg.sampleSize >= MIN_SAMPLE_FOR_PROFILE_DIMENSION) {
      dimensions.elimination = { label: rateRate(agg.eliminationRate, false), sampleSize: agg.sampleSize };
      dimensions.blindGuessing = { label: rateRate(agg.blindGuessRate, true), sampleSize: agg.sampleSize };
      dimensions.timeAllocation = { label: rateRate(agg.timeOverrunRate, true), sampleSize: agg.sampleSize };
      dimensions.answerSwitching = { label: rateRate(agg.unsupportedSwitchRate, true), sampleSize: agg.sampleSize };
    }

    return { studentId, dimensions, sampleSize: agg.sampleSize };
  }

  async getDecisionHistory(tenantId: string, studentId: string, opts: { limit?: number; before?: string } = {}): Promise<DecisionEvent[]> {
    return this.deps.events.listByStudent(tenantId, studentId, opts);
  }

  async getDecisionInsights(tenantId: string, studentId: string): Promise<DecisionInsight[]> {
    return this.deps.insights.generateInsights(tenantId, studentId);
  }

  async startDecisionTraining(tenantId: string, studentId: string, mode: TrainingMode, difficultyLevel?: number): Promise<TrainingScenario | null> {
    return this.deps.training.startTraining(tenantId, studentId, mode, difficultyLevel);
  }

  async getDecisionScenario(tenantId: string, scenarioId: string): Promise<TrainingScenario | null> {
    return this.deps.training.getScenario(tenantId, scenarioId);
  }

  async submitDecision(input: DecisionEventInput, options?: { gradedIsCorrect?: boolean | null; policy?: DecisionPolicy | null }): Promise<SubmitDecisionResult> {
    return this.deps.training.submitDecision(input, options);
  }

  async getConfidenceCalibration(tenantId: string, studentId: string): Promise<Misalignment[]> {
    return this.deps.calibration.getMisalignments(tenantId, studentId);
  }

  async getSkippingAnalysis(tenantId: string, studentId: string): Promise<SkipAnalysis[]> {
    const skips = await this.deps.events.listByStudent(tenantId, studentId, { action: 'SKIP', limit: 100 });
    return Promise.all(skips.map((event) => this.deps.skipping.analyzeSkip(event)));
  }

  async getAnswerSwitchAnalysis(tenantId: string, studentId: string): Promise<{ summary: SwitchQualityBreakdown; perDecision: { eventId: string; support: SwitchSupport }[] }> {
    const events = await this.deps.events.listByStudent(tenantId, studentId, { limit: 200 });
    const relevant = events.filter((e) => e.answerChanged || e.action === 'KEEP_ANSWER' || e.action === 'CHANGE_ANSWER');
    return {
      summary: this.deps.switching.classify(events),
      perDecision: relevant.map((e) => ({ eventId: e.id, support: this.deps.switching.evaluateSwitchSupport(e) })),
    };
  }
}
