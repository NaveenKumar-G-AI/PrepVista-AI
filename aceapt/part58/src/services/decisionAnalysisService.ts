/**
 * DecisionAnalysisService (§61-63, §104, §133, §169-171). Runs after an
 * outcome is known and computes process quality — using only fields that were
 * recorded at decision time (see domain/decisionQuality.ts for how that's
 * enforced structurally, not just by convention).
 */
import type { AnalyticsPublisher } from '../ports';
import type { DecisionEventRepository } from '../repositories/types';
import { assessOutcome, assessProcessQuality, type DecisionQualityInput } from '../domain/decisionQuality';
import type { DecisionEvent } from '../types';

function toQualityInput(event: DecisionEvent): DecisionQualityInput {
  return {
    action: event.action,
    uncertaintyState: event.uncertaintyState,
    evidenceUsed: event.evidenceUsed,
    totalOptions: event.totalOptions,
    eliminatedOptionIds: event.eliminatedOptionIds,
    elapsedTimeSeconds: event.elapsedTimeSeconds,
    questionExpectedTimeSeconds: event.questionExpectedTimeSeconds,
    remainingTestTimeSeconds: event.remainingTestTimeSeconds,
    confidenceBand: event.confidenceBand,
    // policy and comparableCalibration are intentionally left undefined here;
    // callers with that context should use assessProcessQuality directly with
    // a fuller DecisionQualityInput. This keeps the *stored* quality profile
    // conservative rather than silently assuming a policy that may have
    // changed since the decision was made.
  };
}

export class DecisionAnalysisService {
  constructor(
    private readonly events: DecisionEventRepository,
    private readonly analytics: AnalyticsPublisher
  ) {}

  async analyzeAfterOutcome(tenantId: string, eventId: string, isCorrect: boolean | null): Promise<DecisionEvent | null> {
    const event = await this.events.findById(tenantId, eventId);
    if (!event) return null;

    const quality = assessProcessQuality(toQualityInput(event));
    const outcome = assessOutcome(isCorrect);
    const updated = await this.events.updateOutcomeAndQuality(tenantId, eventId, outcome, quality);

    await this.analytics.publish('decision_reviewed', { tenantId, eventId, isCorrect });
    return updated;
  }
}
