import React from 'react';

export function InsufficientEvidenceState({ reason, targetName }: { reason: string | null; targetName: string }) {
  return (
    <div className="rounded-lg border border-dashed border-align-border-strong bg-align-surface p-6 text-center">
      <div className="font-body text-xs uppercase tracking-wider text-align-text-tertiary">{targetName}</div>
      <div className="mt-1 font-display text-lg font-semibold text-align-text-primary">Insufficient Evidence</div>
      <p className="mx-auto mt-2 max-w-sm font-body text-sm text-align-text-secondary">
        {reason ?? 'We need more evidence before making a reliable alignment result for this target.'}
      </p>
    </div>
  );
}
