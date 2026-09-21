import { useState } from 'react';
import { CompleteResponse } from '../types';
import { EffectivenessBadge } from './CalibrationMeter';
import { api } from '../api';

interface Props {
  studentId: string;
  result: CompleteResponse;
  onContinue: () => void;
}

export function AfterInterventionSummary({ studentId, result, onContinue }: Props) {
  const { execution, outcome, comparison, readiness } = result;
  const [retentionAccuracy, setRetentionAccuracy] = useState(outcome.immediateAccuracyPct ?? 75);
  const [retentionOutcome, setRetentionOutcome] = useState(outcome);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  const before = outcome.beforeAccuracyPct;
  const after = outcome.immediateAccuracyPct;
  const delta = before !== undefined && after !== undefined ? after - before : null;

  async function runRetentionCheck() {
    setChecking(true);
    try {
      const res = await api.retentionCheck(studentId, execution.id, { accuracyPct: retentionAccuracy, daysAfter: 7 });
      setRetentionOutcome(res.outcome);
      setChecked(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Intervention complete</span>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <Stat label="Before" value={before} />
        <Stat label="After" value={after} highlight />
        <Stat label="Change" value={delta} signed />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-paper px-4 py-3">
        <span className="text-sm text-muted">Result</span>
        <EffectivenessBadge label={outcome.immediateEffectiveness} />
      </div>

      {comparison && (
        <p className="mt-3 text-xs text-muted">
          {comparison.betterThanAverage ? 'Stronger than' : 'In line with'} this student's average response to this
          intervention type so far ({comparison.previousAvgImmediateDeltaPct > 0 ? '+' : ''}
          {comparison.previousAvgImmediateDeltaPct} pts on average).
        </p>
      )}

      {readiness !== 'unavailable' && (
        <p className="mt-2 text-xs text-muted">Readiness trajectory recalculated: now at {readiness}%.</p>
      )}

      {/* Retention check — demonstrates Section 11: immediate improvement isn't the same as learning */}
      <div className="mt-5 rounded-xl bg-paper p-4">
        <p className="text-sm font-medium text-ink">Verify retention</p>
        <p className="mt-1 text-xs text-muted">
          Immediate improvement isn't the same as learning. In production this check runs automatically a few days
          later — simulate it now to see how the outcome record updates.
        </p>

        {!checked ? (
          <div className="mt-3 flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={100}
              value={retentionAccuracy}
              onChange={e => setRetentionAccuracy(Number(e.target.value))}
              className="w-24 rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-ink"
            />
            <span className="text-xs text-muted">% accuracy, 7 days later</span>
            <button
              onClick={runRetentionCheck}
              disabled={checking}
              className="ml-auto rounded-lg border border-teal px-3 py-2 font-display text-xs font-semibold text-teal transition-colors hover:bg-tealSoft disabled:opacity-50"
            >
              {checking ? 'Checking…' : 'Simulate'}
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-sm text-ink">{retentionOutcome.retentionAccuracyPct}% retained</span>
            {retentionOutcome.retentionEffectiveness && <EffectivenessBadge label={retentionOutcome.retentionEffectiveness} />}
          </div>
        )}
      </div>

      <button
        onClick={onContinue}
        className="mt-5 w-full rounded-xl bg-ink py-3 text-center font-display text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Continue
      </button>
    </div>
  );
}

function Stat({ label, value, highlight, signed }: { label: string; value?: number | null; highlight?: boolean; signed?: boolean }) {
  const display = value === undefined || value === null ? '—' : `${signed && value > 0 ? '+' : ''}${Math.round(value)}%`;
  return (
    <div className="rounded-xl bg-paper py-3">
      <div className={`font-mono text-2xl ${highlight ? 'text-teal' : 'text-ink'}`}>{display}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
