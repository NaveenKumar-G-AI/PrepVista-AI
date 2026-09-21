import React from 'react';
import { AlignmentResult } from '../../types/align.types';
import { LevelPill } from './shared';

export function GapFlow({
  result,
  onImprove,
  onProve,
}: {
  result: AlignmentResult;
  onImprove?: (capabilityId: string) => void;
  onProve?: () => void;
}) {
  const action = result.nextBestAction;
  const gap = [...result.criticalGaps, ...result.supportingGaps].find(
    (g) => g.capabilityId === action?.capabilityId,
  );

  if (!action || !gap) {
    return (
      <div className="rounded-lg border border-align-border bg-align-surface p-5 font-body text-sm text-align-text-secondary">
        No outstanding gap identified for this target right now.
      </div>
    );
  }

  const steps: { label: string; content: React.ReactNode }[] = [
    { label: 'Current', content: <LevelPill level={gap.currentLevel} /> },
    { label: 'Target requires', content: <LevelPill level={gap.requiredLevel} met /> },
    {
      label: 'Gap',
      content: (
        <span className={`font-body text-sm ${gap.isCritical ? 'text-align-critical' : 'text-align-caution'}`}>
          {gap.capabilityName}
        </span>
      ),
    },
  ];

  return (
    <div className="rounded-lg border border-align-border bg-align-surface p-5">
      <h3 className="font-display text-base font-semibold text-align-text-primary">Next best action</h3>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <div className="flex flex-col items-start gap-1">
              <span className="font-body text-[11px] uppercase tracking-wider text-align-text-tertiary">
                {step.label}
              </span>
              {step.content}
            </div>
            {i < steps.length - 1 && (
              <span className="text-align-text-tertiary" aria-hidden="true">
                &#8594;
              </span>
            )}
          </React.Fragment>
        ))}
      </div>

      <ul className="mt-4 space-y-1">
        {action.rationale.map((line, i) => (
          <li key={i} className="font-body text-xs text-align-text-tertiary">
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => onImprove?.(action.capabilityId)}
          className="rounded-md bg-align-fit-dim px-4 py-2 font-body text-sm font-medium text-align-text-primary transition-colors hover:bg-align-fit focus-visible:outline focus-visible:outline-2 focus-visible:outline-align-fit"
        >
          Improve this gap
        </button>
        <button
          type="button"
          onClick={onProve}
          className="rounded-md border border-align-border-strong px-4 py-2 font-body text-sm font-medium text-align-text-primary transition-colors hover:bg-align-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-align-readiness"
        >
          Prove this target
        </button>
      </div>
    </div>
  );
}
