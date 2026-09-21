import { InsightSeverity } from '../domain/types';

// ============================================================
// FEATURE 7 INTEGRATION SEAM  (spec section 38)
// ============================================================
// Feature 9 sends structured signals; Feature 7 decides what the
// student should do next. Feature 9 must never generate its own
// recommendation copy in production - MockFeature7Client below only
// returns a templated placeholder so the demo report has something to
// show. Replace it with a call into your real Feature 7 service.

export interface Feature9Signal {
  student_id: string;
  signal: string;
  severity: InsightSeverity;
  confidence: number;
  evidence: Record<string, unknown>;
}

export interface Feature7Response {
  nextAction?: string;
}

export interface Feature7Client {
  sendSignal(signal: Feature9Signal): Promise<Feature7Response>;
}

const PLACEHOLDER_ACTIONS: Record<string, string> = {
  TIME_MANAGEMENT_WEAK: 'Timed mixed practice focused on decision-making and pacing.',
  DATA_INTERPRETATION_PERFORMANCE_WEAK: 'Timed mixed Data Interpretation practice.',
  ENDURANCE_DECLINE: 'Short full-length simulations to build stamina before increasing duration.',
  DECISION_QUALITY_WEAK: 'Targeted skip/return strategy drills under a visible time budget.',
  RECOVERY_WEAK: 'Mixed practice sets that deliberately front-load 2-3 hard questions.',
  ACCURACY_WEAK: 'Concept-focused adaptive practice on the lowest-mastery skills.',
};

export class MockFeature7Client implements Feature7Client {
  private received: Feature9Signal[] = [];

  async sendSignal(signal: Feature9Signal): Promise<Feature7Response> {
    this.received.push(signal);
    return {
      nextAction: PLACEHOLDER_ACTIONS[signal.signal] ?? 'Targeted adaptive practice on the flagged skill.',
    };
  }

  /** Test/demo helper - not part of the Feature7Client contract. */
  getReceivedSignals() {
    return this.received;
  }
}
