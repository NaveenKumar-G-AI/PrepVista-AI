import React from 'react';
import { TargetPriorityEntry } from '../../types/align.types';
import { TargetCard } from './TargetCard';

export function TargetPriorityList({
  shortlist,
  awaitingEvidence,
  onView,
}: {
  shortlist: TargetPriorityEntry[];
  awaitingEvidence: { targetId: string; targetName: string }[];
  onView?: (targetId: string) => void;
}) {
  if (shortlist.length === 0 && awaitingEvidence.length === 0) {
    return (
      <p className="font-body text-sm text-align-text-tertiary">
        No targets configured yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shortlist.map((entry) => (
          <TargetCard key={entry.targetId} entry={entry} onView={onView} />
        ))}
      </div>

      {awaitingEvidence.length > 0 && (
        <div className="rounded-lg border border-dashed border-align-border p-3">
          <div className="font-body text-xs uppercase tracking-wider text-align-text-tertiary">
            Still gathering evidence for
          </div>
          <div className="mt-1 font-body text-sm text-align-text-secondary">
            {awaitingEvidence.map((t) => t.targetName).join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}
