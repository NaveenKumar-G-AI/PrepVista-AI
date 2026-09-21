import { DimensionScores } from '../domain/types';

// ============================================================
// FEATURE 6 INTEGRATION SEAM  (spec section 37)
// ============================================================
// Feature 6 owns "is the student ready?". Feature 9 only supplies
// simulation evidence - it never computes or overwrites a readiness
// verdict itself. Replace MockFeature6Client with a call into your
// real Feature 6 service.

export interface SimulationEvidenceForReadiness {
  simulationId: string;
  overallScore: number;
  dimensions: DimensionScores;
}

export interface Feature6Client {
  submitSimulationEvidence(studentId: string, evidence: SimulationEvidenceForReadiness): Promise<void>;
}

export class MockFeature6Client implements Feature6Client {
  private submissions: Array<{ studentId: string; evidence: SimulationEvidenceForReadiness }> = [];

  async submitSimulationEvidence(studentId: string, evidence: SimulationEvidenceForReadiness): Promise<void> {
    this.submissions.push({ studentId, evidence });
  }

  /** Test/demo helper - not part of the Feature6Client contract. */
  getSubmissions() {
    return this.submissions;
  }
}
