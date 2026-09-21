import { useState } from 'react';
import { InterventionDecision, DISPLAY_NAME } from '../types';
import { CalibrationMeter } from './CalibrationMeter';

interface Props {
  decision: InterventionDecision;
  explanation: string;
  coldStart: boolean;
  onStart: () => void;
  starting: boolean;
}

export function NextInterventionCard({ decision, explanation, coldStart, onStart, starting }: Props) {
  const [whyOpen, setWhyOpen] = useState(false);
  const name = DISPLAY_NAME[decision.selected.type] ?? decision.selected.type;
  const durationMatch = explanation.match(/(\d+)-minute/);
  const duration = durationMatch ? durationMatch[1] : null;

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Your next intervention</span>
        {coldStart && (
          <span className="rounded-full bg-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted">
            early data
          </span>
        )}
      </div>

      <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{name}</h2>

      <div className="mt-1 flex items-center gap-3 font-mono text-sm text-muted">
        {duration && <span>{duration} min</span>}
        <span>·</span>
        <span>{decision.problem.topic}</span>
      </div>

      {/* Focus areas */}
      <div className="mt-4 flex flex-wrap gap-2">
        {focusAreasFrom(decision).map(area => (
          <span key={area} className="rounded-full bg-tealSoft px-3 py-1 text-xs font-medium text-teal">
            {area}
          </span>
        ))}
      </div>

      {/* Why panel — the trust feature (Section 63) */}
      <button
        onClick={() => setWhyOpen(o => !o)}
        className="mt-5 flex w-full items-center justify-between rounded-xl border border-line bg-paper px-4 py-3 text-left transition-colors hover:border-teal/40"
      >
        <span className="font-display text-sm font-semibold text-ink">Why this?</span>
        <span className="font-mono text-xs text-muted">{whyOpen ? '−' : '+'}</span>
      </button>

      {whyOpen && (
        <div className="mt-3 space-y-3 rounded-xl bg-paper p-4">
          <p className="text-sm leading-relaxed text-ink">{explanation}</p>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Confidence</span>
            <div className="flex-1">
              <CalibrationMeter value={decision.confidence} size="sm" />
            </div>
            <span className="font-mono text-xs text-ink">{decision.confidence.toFixed(2)}</span>
          </div>

          <ul className="space-y-1.5">
            {decision.problem.evidence.map((e, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted">
                <span className="font-mono text-teal">{String(i + 1).padStart(2, '0')}</span>
                <span>{e.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onStart}
        disabled={starting}
        className="mt-5 w-full rounded-xl bg-teal py-3 text-center font-display text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {starting ? 'Starting…' : 'Start'}
      </button>
    </div>
  );
}

function focusAreasFrom(decision: InterventionDecision): string[] {
  // The contract's focusAreas aren't in the decision payload (they're
  // generated at start-time from the catalog), so this shows a topic-level
  // placeholder chip until the intervention actually starts.
  return [decision.problem.category.replaceAll('_', ' ').toLowerCase()];
}
