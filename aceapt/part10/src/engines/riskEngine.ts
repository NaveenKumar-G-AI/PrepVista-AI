import { THRESHOLDS } from '../config/thresholds';
import { RiskSignal, RiskSeverity } from '../types';

export interface RiskDetectionInputs {
  studentId: string;
  averageSimulationTimeRatio: number | null; // SS20 time management
  lateSessionDeclineRatio: number | null; // SS23 endurance
  retentionGapDays: number | null; // SS24
  retrievalDeclineDetected: boolean;
  simulationCount: number;
  mildAccuracyDeclineDetected: boolean; // SS21 early warning inputs
  responseTimeIncreaseDetected: boolean;
}

function severityFromBands(value: number, high: number, medium: number): RiskSeverity | null {
  if (value >= high) return 'HIGH';
  if (value >= medium) return 'MEDIUM';
  return null;
}

/**
 * SS20 Risk Engine, SS21 Early Warning, SS23 Endurance Forecast,
 * SS24 Retention Risk.
 * Produces structured signals (type/severity/confidence/evidence) meant
 * to be consumed by Feature 7 - this engine identifies *what* is at
 * risk, never *what to do about it* (that stays Feature 7's job, SS28).
 */
export function detectRisks(inputs: RiskDetectionInputs): RiskSignal[] {
  const now = new Date().toISOString();
  const risks: RiskSignal[] = [];
  const cfg = THRESHOLDS.risk;

  if (inputs.averageSimulationTimeRatio !== null) {
    const sev = severityFromBands(
      inputs.averageSimulationTimeRatio,
      cfg.timeManagementRatioHigh,
      cfg.timeManagementRatioMedium
    );
    if (sev) {
      risks.push({
        studentId: inputs.studentId,
        type: 'TIME_MANAGEMENT_RISK',
        severity: sev,
        confidence: Math.min(0.95, 0.5 + inputs.simulationCount * 0.08),
        evidence: {
          simulation_count: inputs.simulationCount,
          average_time_ratio: inputs.averageSimulationTimeRatio,
        },
        status: 'ACTIVE',
        firstDetected: now,
        lastUpdated: now,
      });
    }
  }

  if (inputs.lateSessionDeclineRatio !== null) {
    const sev = severityFromBands(
      inputs.lateSessionDeclineRatio,
      cfg.lateSessionDeclineHigh,
      cfg.lateSessionDeclineMedium
    );
    if (sev) {
      risks.push({
        studentId: inputs.studentId,
        type: 'ENDURANCE_RISK',
        severity: sev,
        confidence: Math.min(0.9, 0.5 + inputs.simulationCount * 0.08),
        evidence: {
          simulation_count: inputs.simulationCount,
          late_session_decline: inputs.lateSessionDeclineRatio,
        },
        status: 'ACTIVE',
        firstDetected: now,
        lastUpdated: now,
      });
    }
  }

  if (inputs.retentionGapDays !== null) {
    const sev = severityFromBands(inputs.retentionGapDays, cfg.retentionGapDaysHigh, cfg.retentionGapDaysMedium);
    if (sev || inputs.retrievalDeclineDetected) {
      risks.push({
        studentId: inputs.studentId,
        type: 'RETENTION_RISK',
        severity: sev ?? 'MEDIUM',
        confidence: inputs.retrievalDeclineDetected ? 0.75 : 0.6,
        evidence: { gap_days: inputs.retentionGapDays, retrieval_decline_detected: inputs.retrievalDeclineDetected },
        status: 'ACTIVE',
        firstDetected: now,
        lastUpdated: now,
      });
    }
  }

  // SS21 Early Warning - multiple mild signals co-occurring, none individually severe yet.
  const mildSignalCount = [
    inputs.mildAccuracyDeclineDetected,
    inputs.responseTimeIncreaseDetected,
    inputs.retrievalDeclineDetected,
    inputs.lateSessionDeclineRatio !== null &&
      inputs.lateSessionDeclineRatio > 0 &&
      inputs.lateSessionDeclineRatio < cfg.lateSessionDeclineMedium,
  ].filter(Boolean).length;

  if (
    mildSignalCount >= cfg.earlyWarningMildSignalCount &&
    !risks.some((r) => r.type === 'ENDURANCE_RISK' && r.severity === 'HIGH')
  ) {
    risks.push({
      studentId: inputs.studentId,
      type: 'EARLY_PERFORMANCE_RISK',
      severity: 'LOW',
      confidence: 0.5,
      evidence: { mild_signal_count: mildSignalCount },
      status: 'ACTIVE',
      firstDetected: now,
      lastUpdated: now,
    });
  }

  return risks;
}
