import { Feature7Client, Feature9Signal } from '../integrations/feature7';
import { DimensionScores, InsightSeverity } from '../domain/types';
import { clamp, round2 } from '../util/math';

// ============================================================
// NEXT ACTION SIGNAL SERVICE  (spec sections 34, 38, 48)
// ============================================================
// Turns the weakest measured dimension into exactly the structured
// signal shape in spec section 38, sends it to Feature 7, and returns
// whatever Feature 7 decides the next action should be. Feature 9
// never invents its own recommendation copy - see integrations/feature7.ts.

const DIMENSION_TO_SIGNAL: Record<keyof DimensionScores, string> = {
  timeManagement: 'TIME_MANAGEMENT_WEAK',
  decisionQuality: 'DECISION_QUALITY_WEAK',
  recovery: 'RECOVERY_WEAK',
  endurance: 'ENDURANCE_DECLINE',
  accuracy: 'ACCURACY_WEAK',
  consistency: 'CONSISTENCY_WEAK',
  speed: 'SPEED_WEAK',
};

export class NextActionSignalService {
  constructor(private feature7: Feature7Client) {}

  async sendWeakestDimensionSignal(
    studentId: string,
    dimensions: DimensionScores,
    extraEvidence: Record<string, unknown>,
  ): Promise<{ signal: string; nextAction: string | null }> {
    const entries = Object.entries(dimensions) as [keyof DimensionScores, number][];
    const [weakestDimension, weakestScore] = entries.reduce((min, cur) => (cur[1] < min[1] ? cur : min));

    const severity: InsightSeverity = weakestScore < 50 ? 'HIGH' : weakestScore < 70 ? 'MEDIUM' : 'LOW';
    const confidence = round2(clamp(1 - weakestScore / 100, 0.3, 0.95));

    const signal: Feature9Signal = {
      student_id: studentId,
      signal: DIMENSION_TO_SIGNAL[weakestDimension],
      severity,
      confidence,
      evidence: { weakest_dimension_score: weakestScore, ...extraEvidence },
    };

    const response = await this.feature7.sendSignal(signal);
    return { signal: signal.signal, nextAction: response.nextAction ?? null };
  }
}
