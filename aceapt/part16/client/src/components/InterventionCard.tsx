import { InterventionRecommendation } from '../types';

const ESCALATION_LABELS: Record<number, string> = {
  0: 'Normal practice',
  1: 'Hint',
  2: 'Micro explanation',
  3: 'Worked example',
  4: 'Guided practice',
  5: 'Prerequisite repair',
  6: 'Alternative strategy',
  7: 'Deep remediation',
};

export function InterventionCard({ recommendation }: { recommendation: InterventionRecommendation }) {
  return (
    <div className="rounded-md border border-line bg-surface shadow-panel">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="font-display text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Recommended intervention</p>
        <span className="font-mono text-[11px] uppercase tracking-wide text-signal-gold">
          Level {recommendation.escalationLevel} · {ESCALATION_LABELS[recommendation.escalationLevel]}
        </span>
      </div>
      <div className="px-5 py-4">
        <p className="font-display text-lg font-medium text-ink">{recommendation.label}</p>
        <p className="mt-1 text-[13px] text-ink-soft">{recommendation.description}</p>
        <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">{recommendation.rationale}</p>
        <p className="mt-2 font-mono text-[11px] text-muted">~{recommendation.estimatedMinutes} min</p>
      </div>
    </div>
  );
}
