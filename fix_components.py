import os

score_summary_code = '''import { isMeasuredScore, measurementLabels, scoreText, type ScoreMeasurement } from '@/lib/score-semantics';

export function ScoreSummary({ value, measurement = {}, suffix = '/100' }: {
  value: number | null | undefined; measurement?: ScoreMeasurement; suffix?: string;
}) {
  return <span>{scoreText(value, measurement, suffix)}</span>;
}

export function MeasurementCoverage({ measurement, expectedQuestions }: { measurement?: ScoreMeasurement; expectedQuestions?: number }) {
  const coverage = measurement?.measurement_coverage;
  const statusLabel = measurement?.evaluation_state ? measurementLabels[measurement.evaluation_state] : 'Unknown';
  
  if (!coverage) return (
    <div className="flex flex-col items-center text-center space-y-1">
      <p className="text-sm font-semibold text-primary">Measurement status: {statusLabel}</p>
    </div>
  );

  return (
    <div className="flex flex-col items-center text-center space-y-1">
      <p className="text-sm font-semibold text-primary">Measurement status: {statusLabel}</p>
      <p className="text-sm text-secondary">
        Measurement coverage is separate from candidate performance.
      </p>
      <p className="text-sm text-secondary">
        This report reflects {coverage.measured} of {expectedQuestions || coverage.asked} planned questions completed.
      </p>
    </div>
  );
}
'''

with open('frontend/src/components/score-summary.tsx', 'w', encoding='utf-8') as f:
    f.write(score_summary_code)
