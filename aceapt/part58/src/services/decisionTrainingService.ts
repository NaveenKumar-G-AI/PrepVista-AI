/**
 * DecisionTrainingService (§77-90, §119, §132, §141-145). Full inline
 * decision coaching is only ever built for TRAINING/PRACTICE/MOCK contexts —
 * a FORMAL_ASSESSMENT submission is recorded like any other but never gets a
 * coaching note back (§119, §190). The assessmentIntegrityGuard middleware is
 * a second, independent layer of defense against this leaking over HTTP; this
 * check exists so the guarantee holds even if this service is called directly.
 */
import type { AnalyticsPublisher, DifficultyProvider } from '../ports';
import type { DecisionEventRepository, ScenarioRepository } from '../repositories/types';
import { assessOutcome, assessProcessQuality, explainDecision } from '../domain/decisionQuality';
import type { DecisionEvent, DecisionEventInput, DecisionPolicy, TrainingMode, TrainingScenario } from '../types';

export interface SubmitDecisionResult {
  event: DecisionEvent;
  /** Present only for TRAINING/PRACTICE/MOCK, and only once graded. */
  coaching: string | null;
}

export class DecisionTrainingService {
  constructor(
    private readonly scenarios: ScenarioRepository,
    private readonly events: DecisionEventRepository,
    private readonly difficultyProvider: DifficultyProvider,
    private readonly analytics: AnalyticsPublisher
  ) {}

  /** Picks a servable (already-validated, §194) scenario for a mode/difficulty. */
  async startTraining(tenantId: string, studentId: string, mode: TrainingMode, difficultyLevel = 1): Promise<TrainingScenario | null> {
    const scenario = await this.scenarios.findServable(tenantId, mode, difficultyLevel);
    await this.analytics.publish('decision_started', { tenantId, studentId, mode, difficultyLevel });
    return scenario;
  }

  /** Fetches one specific scenario by id (e.g. to resume or share). */
  async getScenario(tenantId: string, scenarioId: string): Promise<TrainingScenario | null> {
    return this.scenarios.findById(tenantId, scenarioId);
  }

  async submitDecision(
    input: DecisionEventInput,
    options: { gradedIsCorrect?: boolean | null; policy?: DecisionPolicy | null } = {}
  ): Promise<SubmitDecisionResult> {
    const event = await this.events.create(input);
    await this.publishActionEvents(input);

    if (input.context === 'FORMAL_ASSESSMENT') {
      return { event, coaching: null };
    }

    if (options.gradedIsCorrect === undefined) {
      await this.analytics.publish('decision_completed', { tenantId: input.tenantId, studentId: input.studentId, action: input.action });
      return { event, coaching: null };
    }

    const quality = assessProcessQuality({
      action: event.action,
      uncertaintyState: event.uncertaintyState,
      evidenceUsed: event.evidenceUsed,
      totalOptions: event.totalOptions,
      eliminatedOptionIds: event.eliminatedOptionIds,
      elapsedTimeSeconds: event.elapsedTimeSeconds,
      questionExpectedTimeSeconds: event.questionExpectedTimeSeconds,
      remainingTestTimeSeconds: event.remainingTestTimeSeconds,
      policy: options.policy,
      confidenceBand: event.confidenceBand,
    });
    const outcome = assessOutcome(options.gradedIsCorrect);
    const graded = await this.events.updateOutcomeAndQuality(input.tenantId, event.id, outcome, quality);

    const coaching = explainDecision(
      {
        action: event.action,
        uncertaintyState: event.uncertaintyState,
        evidenceUsed: event.evidenceUsed,
        totalOptions: event.totalOptions,
        eliminatedOptionIds: event.eliminatedOptionIds,
        elapsedTimeSeconds: event.elapsedTimeSeconds,
        questionExpectedTimeSeconds: event.questionExpectedTimeSeconds,
        remainingTestTimeSeconds: event.remainingTestTimeSeconds,
        policy: options.policy,
        confidenceBand: event.confidenceBand,
      },
      outcome
    );

    await this.analytics.publish('decision_completed', { tenantId: input.tenantId, studentId: input.studentId, action: input.action });
    return { event: graded ?? event, coaching };
  }

  private async publishActionEvents(input: DecisionEventInput): Promise<void> {
    if (input.confidenceBand) {
      await this.analytics.publish('confidence_recorded', { tenantId: input.tenantId, band: input.confidenceBand });
    }
    if (input.eliminatedOptionIds.length > 0) {
      await this.analytics.publish('option_eliminated', { tenantId: input.tenantId, count: input.eliminatedOptionIds.length });
    }
    if (input.action === 'PARTIAL_SOLVE') {
      await this.analytics.publish('partial_progress_recorded', { tenantId: input.tenantId });
    }
    await this.analytics.publish('action_selected', { tenantId: input.tenantId, action: input.action });
    if (input.action === 'INFORMED_GUESS') await this.analytics.publish('informed_guess_recorded', { tenantId: input.tenantId });
    if (input.action === 'BLIND_GUESS') await this.analytics.publish('blind_guess_recorded', { tenantId: input.tenantId });
    if (input.action === 'INFORMED_GUESS' || input.action === 'BLIND_GUESS') {
      await this.analytics.publish('guess_made', { tenantId: input.tenantId, action: input.action });
    }
    if (input.action === 'SKIP') await this.analytics.publish('skip_selected', { tenantId: input.tenantId });
    if (input.action === 'RETURN_LATER') await this.analytics.publish('return_later', { tenantId: input.tenantId });
    if (input.action === 'CHANGE_ANSWER' || input.answerChanged) {
      await this.analytics.publish('answer_changed', { tenantId: input.tenantId });
    }
    if (input.action === 'KEEP_ANSWER') await this.analytics.publish('answer_kept', { tenantId: input.tenantId });
  }
}
