import { isMeasuredScore, measurementLabels, scoreText, type ScoreMeasurement } from '@/lib/score-semantics';

export function ScoreSummary({ value, measurement = {}, suffix = '/100' }: {
  value: number | null | undefined; measurement?: ScoreMeasurement; suffix?: string;
}) {
  const coverage = measurement.measurement_coverage;
  return <span>
    <span>{scoreText(value, measurement, suffix)}</span>
    {isMeasuredScore(value) && measurement.evaluation_state && measurement.evaluation_state !== 'COMPLETE'
      ? <small className="block text-secondary">{measurementLabels[measurement.evaluation_state]}</small> : null}
    {coverage && coverage.asked > 0 ? <small className="block text-secondary">
      {coverage.measured}/{coverage.asked} assessed{coverage.intentional ? `; ${coverage.intentional} no-answer/skip` : ''}
    </small> : null}
  </span>;
}
