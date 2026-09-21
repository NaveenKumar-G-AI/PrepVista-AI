import { Diagnosis } from '../types';
import { SignalRow, ConfidenceTag } from './SignalPrimitives';

interface Props {
  diagnosis: Diagnosis;
  onSeeWhy?: () => void;
  onPracticeThis?: () => void;
  onTryAnotherApproach?: () => void;
}

export function AttemptResultPanel({ diagnosis, onSeeWhy, onPracticeThis, onTryAnotherApproach }: Props) {
  const { uiPanel, primary, insufficientEvidence } = diagnosis;

  return (
    <div className="rounded-md border border-line bg-surface shadow-panel">
      <div className="border-b border-line px-5 py-3">
        <p className="font-display text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Let's find what happened</p>
      </div>

      <div className="px-5">
        <SignalRow label="Concept understanding" status={uiPanel.conceptStatus} />
        <SignalRow label="Method selection" status={uiPanel.methodStatus} />
        <SignalRow label="Calculation" status={uiPanel.calculationStatus} />
      </div>

      <div className="mx-5 my-4 rounded-md bg-signal-goldSoft/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-signal-gold">Likely issue</p>
            <p className="font-display text-lg font-medium text-ink">{uiPanel.likelyIssueLabel}</p>
          </div>
          {!insufficientEvidence && <ConfidenceTag confidence={primary.confidence} />}
        </div>
        {!insufficientEvidence && <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{primary.evidenceSummary}</p>}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
        <button
          onClick={onSeeWhy}
          className="rounded-sm border border-line bg-surface px-3.5 py-2 font-body text-[13px] font-medium text-ink transition hover:border-ink/30 hover:bg-porcelain"
        >
          See why
        </button>
        <button
          onClick={onPracticeThis}
          className="rounded-sm bg-ink px-3.5 py-2 font-body text-[13px] font-medium text-porcelain transition hover:bg-ink-soft"
        >
          Practice this
        </button>
        <button
          onClick={onTryAnotherApproach}
          className="rounded-sm border border-line bg-surface px-3.5 py-2 font-body text-[13px] font-medium text-ink transition hover:border-ink/30 hover:bg-porcelain"
        >
          Try another approach
        </button>
      </div>
    </div>
  );
}
