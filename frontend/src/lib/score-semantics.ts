export type EvaluationState = 'COMPLETE' | 'PARTIALLY_COMPLETE' | 'PENDING' | 'UNAVAILABLE' | 'NOT_MEASURED';
export interface ScoreMeasurement {
  evaluation_state?: EvaluationState;
  measurement_label?: string;
  readiness_eligible?: boolean;
  measurement_coverage?: { asked: number; measured: number; intentional: number; scoreable?: number; measured_pct?: number | null } | null;
}
export const measurementLabels: Record<EvaluationState, string> = {
  COMPLETE: 'Measured', PARTIALLY_COMPLETE: 'Partially measured',
  PENDING: 'Evaluation pending', UNAVAILABLE: 'Evaluation unavailable', NOT_MEASURED: 'Not measured',
};
export function isMeasuredScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
export function scoreText(value: unknown, measurement: ScoreMeasurement = {}, suffix = '/100'): string {
  if (isMeasuredScore(value)) return `${Math.round(value)}${suffix}`;
  return measurement.evaluation_state ? measurementLabels[measurement.evaluation_state] : 'Not measured';
}
