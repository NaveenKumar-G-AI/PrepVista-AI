import React from 'react';
import { TargetPriorityEntry } from '../../types/align.types';
import { StateBadge } from './shared';

const TIER_LABEL: Record<TargetPriorityEntry['tier'], string> = {
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
  STRETCH: 'Stretch',
};

export function TargetCard({
  entry,
  onView,
}: {
  entry: TargetPriorityEntry;
  onView?: (targetId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onView?.(entry.targetId)}
      className="group flex w-full flex-col gap-3 rounded-lg border border-align-border bg-align-surface p-4 text-left transition-colors hover:border-align-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-align-fit"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-body text-[11px] uppercase tracking-wider text-align-text-tertiary">
            {TIER_LABEL[entry.tier]} target
          </div>
          <div className="font-display text-lg font-semibold text-align-text-primary">{entry.targetName}</div>
        </div>
        <StateBadge state={entry.state} />
      </div>

      <div className="flex gap-6">
        <div>
          <div className="font-body text-[11px] uppercase tracking-wider text-align-text-tertiary">Fit</div>
          <div className="font-mono text-2xl text-align-fit tabular-nums">
            {entry.fitScore === null ? '\u2014' : `${entry.fitScore}%`}
          </div>
        </div>
        <div>
          <div className="font-body text-[11px] uppercase tracking-wider text-align-text-tertiary">Readiness</div>
          <div className="font-mono text-2xl text-align-readiness tabular-nums">
            {entry.readinessScore === null ? '\u2014' : `${entry.readinessScore}%`}
          </div>
        </div>
      </div>

      <p className="font-body text-sm text-align-text-secondary">{entry.reason}</p>
    </button>
  );
}
