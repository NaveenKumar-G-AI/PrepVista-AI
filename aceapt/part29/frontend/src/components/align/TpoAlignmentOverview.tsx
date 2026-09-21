import React from 'react';
import { AlignmentState, CohortTargetSummary } from '../../types/align.types';
import { STATE_LABEL } from './shared';

const STATE_ORDER: AlignmentState[] = [
  'STRONGLY_ALIGNED',
  'DEVELOPING_ALIGNMENT',
  'LOW_ALIGNMENT',
  'INSUFFICIENT_EVIDENCE',
];
const STATE_BAR_COLOR: Record<AlignmentState, string> = {
  STRONGLY_ALIGNED: 'bg-align-readiness',
  DEVELOPING_ALIGNMENT: 'bg-align-caution',
  LOW_ALIGNMENT: 'bg-align-critical',
  INSUFFICIENT_EVIDENCE: 'bg-align-border-strong',
};

export function TpoAlignmentOverview({
  targets,
  topCohortGaps,
}: {
  targets: CohortTargetSummary[];
  topCohortGaps: { capabilityName: string; count: number }[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-align-text-primary">Cohort target alignment</h2>
        <div className="mt-3 space-y-4">
          {targets.map((t) => {
            const total = STATE_ORDER.reduce((sum, s) => sum + (t.counts[s] ?? 0), 0) || 1;
            return (
              <div key={t.targetId}>
                <div className="flex items-baseline justify-between font-body text-sm text-align-text-primary">
                  <span>{t.targetName}</span>
                  <span className="font-mono text-xs text-align-text-tertiary">{total} students</span>
                </div>
                <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-align-surface-raised">
                  {STATE_ORDER.map((s) => {
                    const width = ((t.counts[s] ?? 0) / total) * 100;
                    if (width === 0) return null;
                    return (
                      <div
                        key={s}
                        className={STATE_BAR_COLOR[s]}
                        style={{ width: `${width}%` }}
                        title={`${STATE_LABEL[s]}: ${t.counts[s]}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="font-display text-lg font-semibold text-align-text-primary">Top cohort gaps</h2>
        <p className="mt-1 font-body text-xs text-align-text-tertiary">
          The highest-impact capability areas across this cohort.
        </p>
        <ol className="mt-3 space-y-1.5">
          {topCohortGaps.map((g, i) => (
            <li key={g.capabilityName} className="flex items-center gap-3 font-body text-sm text-align-text-primary">
              <span className="font-mono text-xs text-align-text-tertiary">{String(i + 1).padStart(2, '0')}</span>
              {g.capabilityName}
              <span className="font-mono text-xs text-align-text-tertiary">({g.count})</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
