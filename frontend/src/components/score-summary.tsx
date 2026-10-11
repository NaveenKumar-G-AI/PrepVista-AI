import { measurementLabels, scoreText, type ScoreMeasurement } from '@/lib/score-semantics';

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
        Measured evidence is available for {coverage.measured} of {expectedQuestions ?? coverage.asked} planned questions.
      </p>
    </div>
  );
}
