import { SimulationReport as Report } from '../types';
import { DimensionBar } from './DimensionBar';
import { InsightCard } from './InsightCard';

interface Props {
  report: Report;
  onRestart: () => void;
}

const DIMENSION_LABELS: { key: keyof Report['dimensions']; label: string }[] = [
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'speed', label: 'Speed' },
  { key: 'decisionQuality', label: 'Decision quality' },
  { key: 'timeManagement', label: 'Time management' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'endurance', label: 'Endurance' },
];

export function SimulationReport({ report, onRestart }: Props) {
  return (
    <div className="min-h-screen bg-bone text-ink">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="readout text-xs uppercase tracking-[0.3em] text-rust">Simulation complete</p>
        <div className="mt-2 flex items-end gap-4">
          <span className="readout text-7xl font-semibold leading-none">{Math.round(report.overallScore)}</span>
          <span className="pb-2 text-slate">/ 100 overall</span>
        </div>

        {report.comparisonToPrevious && (
          <p className="mt-3 max-w-xl text-sm text-slate">{report.comparisonToPrevious.narrative}</p>
        )}

        <div className="mt-4 flex gap-6 text-sm text-slate">
          <span>{report.correctCount} correct</span>
          <span>{report.wrongCount} wrong</span>
          <span>{report.skippedCount} skipped</span>
        </div>

        <div className="mt-10 grid gap-x-10 gap-y-4 rounded-xl border border-boneline bg-white/40 p-6 md:grid-cols-2">
          {DIMENSION_LABELS.map(({ key, label }) => (
            <DimensionBar
              key={key}
              label={label}
              value={report.dimensions[key]}
              delta={report.comparisonToPrevious?.dimensionDeltas[key]}
            />
          ))}
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-display text-sm uppercase tracking-widest text-moss">Strengths</h3>
            <ul className="mt-3 space-y-2">
              {report.topStrengths.map((s) => (
                <li key={s} className="text-sm text-ink">
                  ✓ {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-display text-sm uppercase tracking-widest text-rust">Bottlenecks</h3>
            <ul className="mt-3 space-y-2">
              {report.topBottlenecks.map((s) => (
                <li key={s} className="text-sm text-ink">
                  ⚠ {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {report.performanceCurve.length > 0 && (
          <div className="mt-10">
            <h3 className="font-display text-sm uppercase tracking-widest text-slate">Performance curve</h3>
            <div className="mt-3 flex gap-4">
              {report.performanceCurve.map((p) => (
                <div key={p.segment} className="flex-1 rounded-lg border border-boneline p-4">
                  <p className="text-xs uppercase tracking-widest text-slate">{p.segment}</p>
                  <p className="readout mt-1 text-2xl">{p.accuracy}%</p>
                  <p className="text-xs text-slate">avg {p.avgTimeSeconds}s / question</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.insights.length > 0 && (
          <div className="mt-10">
            <h3 className="font-display text-sm uppercase tracking-widest text-slate">Evidence-based insights</h3>
            <div className="mt-3 space-y-3">
              {report.insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </div>
        )}

        {report.nextAction && (
          <div className="mt-10 rounded-xl border border-brass bg-brass/10 p-6">
            <p className="readout text-xs uppercase tracking-widest text-brass">Next action · Feature 7</p>
            <p className="mt-2 font-display text-lg">{report.nextAction.label}</p>
          </div>
        )}

        <button
          onClick={onRestart}
          className="mt-12 w-full rounded-lg bg-ink px-6 py-4 font-display text-lg font-semibold text-bone hover:opacity-90"
        >
          Run Another Simulation
        </button>
      </div>
    </div>
  );
}
