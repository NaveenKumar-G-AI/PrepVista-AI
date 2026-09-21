// ============================================================
// FEATURE 3 INTEGRATION SEAM  (spec section 41)
// ============================================================
// Feature 3 is the long-term student-intelligence layer. Feature 9
// forwards trend evidence (simulation performance, time-management
// trend, decision-quality trend, endurance trend, recovery trend,
// regression/improvement trajectory) - it never stores long-term
// student state itself.

export interface LongTermSimulationEvidence {
  simulationId: string;
  overallScore: number;
  timeManagementTrend: number[];
  decisionQualityTrend: number[];
  enduranceTrend: number[];
  recoveryTrend: number[];
  trajectory: 'IMPROVING' | 'REGRESSING' | 'STABLE' | 'INSUFFICIENT_DATA';
}

export interface Feature3Client {
  submitLongTermEvidence(studentId: string, evidence: LongTermSimulationEvidence): Promise<void>;
}

export class MockFeature3Client implements Feature3Client {
  private evidence: Array<{ studentId: string; evidence: LongTermSimulationEvidence }> = [];

  async submitLongTermEvidence(studentId: string, evidence: LongTermSimulationEvidence): Promise<void> {
    this.evidence.push({ studentId, evidence });
  }

  getEvidence() {
    return this.evidence;
  }
}
