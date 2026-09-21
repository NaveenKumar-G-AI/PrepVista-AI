import React from 'react';
import { AlignmentResult } from '../../types/align.types';

export function WhyPanel({ result, explanation }: { result: AlignmentResult; explanation: string }) {
  const topGap = result.criticalGaps[0] ?? result.supportingGaps[0] ?? null;

  return (
    <div className="rounded-lg border border-align-border bg-align-surface p-5">
      <h2 className="font-display text-base font-semibold text-align-text-primary">
        Why {result.targetName}?
      </h2>
      <p className="mt-2 font-body text-sm leading-relaxed text-align-text-secondary">{explanation}</p>

      {result.strengths.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {result.strengths.slice(0, 5).map((s) => (
            <li key={s.capabilityId} className="flex items-center gap-2 font-body text-sm text-align-text-primary">
              <span className="text-align-readiness" aria-hidden="true">
                {'\u2713'}
              </span>
              {s.capabilityName}
            </li>
          ))}
        </ul>
      )}

      {topGap && (
        <div className="mt-4 border-t border-align-border pt-3">
          <span className="font-body text-xs uppercase tracking-wider text-align-text-tertiary">
            Current limitation
          </span>
          <div className="font-body text-sm text-align-text-primary">{topGap.capabilityName}</div>
        </div>
      )}
    </div>
  );
}
