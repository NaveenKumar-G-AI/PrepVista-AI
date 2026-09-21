/**
 * StrategicSkippingService (§41-46, §136, §160). A skip is not inherently
 * good or bad (§41) — this only classifies one when there's enough
 * comparable-accuracy history to say something meaningful (§43 "do not state
 * as absolute if evidence is weak").
 */
import type { AccuracyProvider } from '../ports';
import { MIN_SAMPLE_SIZE_FOR_CALIBRATION_INSIGHT } from '../domain/calibration';
import type { DecisionEvent } from '../types';

export type SkipClassification = 'STRATEGIC' | 'POSSIBLY_EXCESSIVE_CAUTION' | 'INSUFFICIENT_DATA';

export interface SkipAnalysis {
  eventId: string;
  classification: SkipClassification;
  note: string;
}

const HIGH_CONFIDENCE_STATES = ['CERTAIN', 'HIGH_CONFIDENCE'];

export class StrategicSkippingService {
  constructor(private readonly accuracyProvider: AccuracyProvider) {}

  async analyzeSkip(event: DecisionEvent): Promise<SkipAnalysis> {
    if (event.action !== 'SKIP') {
      throw new Error('analyzeSkip called on a decision event whose action is not SKIP.');
    }

    const comparable = await this.accuracyProvider.getComparableAccuracy(event.studentId, {});
    if (!comparable || comparable.sampleSize < MIN_SAMPLE_SIZE_FOR_CALIBRATION_INSIGHT) {
      return {
        eventId: event.id,
        classification: 'INSUFFICIENT_DATA',
        note: 'Not enough comparable history yet to judge this skip either way.',
      };
    }

    const wasConfident = !!event.uncertaintyState && HIGH_CONFIDENCE_STATES.includes(event.uncertaintyState);
    const hadEnoughTime =
      event.remainingTestTimeSeconds == null ||
      (event.questionExpectedTimeSeconds != null && event.remainingTestTimeSeconds > event.questionExpectedTimeSeconds);
    const strongComparableAccuracy = comparable.accuracy >= 0.7;

    if (wasConfident && strongComparableAccuracy && hadEnoughTime) {
      return {
        eventId: event.id,
        classification: 'POSSIBLY_EXCESSIVE_CAUTION',
        note: `Comparable questions have been answered correctly about ${Math.round(
          comparable.accuracy * 100
        )}% of the time, and there was time available (§44).`,
      };
    }

    return {
      eventId: event.id,
      classification: 'STRATEGIC',
      note: 'Consistent with low confidence, a costly question, or limited remaining time (§42).',
    };
  }
}
