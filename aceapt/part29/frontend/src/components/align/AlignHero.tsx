import React from 'react';
import { AlignmentResult } from '../../types/align.types';
import { ConfidenceMeter, MonoStat, StateBadge } from './shared';

export function AlignHero({
  primary,
  onViewWhy,
  onImproveGap,
  onProveTarget,
}: {
  primary: AlignmentResult;
  onViewWhy?: () => void;
  onImproveGap?: () => void;
  onProveTarget?: () => void;
}) {
  const mainGap = primary.criticalGaps[0] ?? primary.supportingGaps[0] ?? null;
  const strongestMatch = primary.strengths[0] ?? null;

  return (
    <section className="align-rise-in rounded-xl border border-align-border bg-align-surface p-6 sm:p-8">
      <div className="font-body text-xs uppercase tracking-[0.2em] text-align-text-tertiary">ACEAPT Align</div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-align-text-primary sm:text-3xl">
          Your strongest current target
        </h1>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-3">
        <span className="font-display text-3xl font-semibold text-align-text-primary sm:text-4xl">
          {primary.targetName}
        </span>
        <StateBadge state={primary.state} />
      </div>

      <div className="mt-6 flex flex-wrap gap-10">
        <MonoStat label="Fit" value={primary.fitScore} tone="fit" />
        <MonoStat label="Readiness" value={primary.readinessScore} tone="readiness" />
        <div>
          <div className="font-body text-xs uppercase tracking-wider text-align-text-tertiary">Evidence</div>
          <div className="mt-2">
            <ConfidenceMeter band={primary.confidence} />
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 border-t border-align-border pt-6 sm:grid-cols-2">
        <div>
          <div className="font-body text-xs uppercase tracking-wider text-align-text-tertiary">Strongest match</div>
          <div className="mt-1 font-body text-sm text-align-text-primary">
            {strongestMatch ? strongestMatch.capabilityName : 'Still gathering evidence'}
          </div>
        </div>
        <div>
          <div className="font-body text-xs uppercase tracking-wider text-align-text-tertiary">Main gap</div>
          <div className="mt-1 font-body text-sm text-align-text-primary">
            {mainGap ? mainGap.capabilityName : 'No significant gap identified'}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onViewWhy}
          className="rounded-md border border-align-border-strong px-4 py-2 font-body text-sm font-medium text-align-text-primary transition-colors hover:bg-align-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-align-fit"
        >
          View why
        </button>
        <button
          type="button"
          onClick={onImproveGap}
          disabled={!mainGap}
          className="rounded-md bg-align-fit-dim px-4 py-2 font-body text-sm font-medium text-align-text-primary transition-colors hover:bg-align-fit disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-align-fit"
        >
          Improve gap
        </button>
        <button
          type="button"
          onClick={onProveTarget}
          className="rounded-md bg-align-readiness-dim px-4 py-2 font-body text-sm font-medium text-align-text-primary transition-colors hover:bg-align-readiness focus-visible:outline focus-visible:outline-2 focus-visible:outline-align-readiness"
        >
          Prove target
        </button>
      </div>
    </section>
  );
}
