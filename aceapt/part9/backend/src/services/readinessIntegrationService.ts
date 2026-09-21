import { Feature6Client } from '../integrations/feature6';
import { DimensionScores } from '../domain/types';

// ============================================================
// READINESS INTEGRATION SERVICE  (spec sections 37, 48)
// ============================================================
// Feature 9 does not decide readiness - it packages simulation
// evidence and hands it to Feature 6, which owns that verdict.

export class ReadinessIntegrationService {
  constructor(private feature6: Feature6Client) {}

  async submitEvidence(studentId: string, simulationId: string, overallScore: number, dimensions: DimensionScores) {
    await this.feature6.submitSimulationEvidence(studentId, {
      simulationId,
      overallScore,
      dimensions,
    });
  }
}
