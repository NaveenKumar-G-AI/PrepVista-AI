import { useEffect, useState } from 'react';
import { InterventionExecution, DISPLAY_NAME } from '../types';

interface Props {
  execution: InterventionExecution;
  onComplete: (result: { accuracyPct: number; questionsCompleted: number }) => void;
  submitting: boolean;
}

export function InterventionRunner({ execution, onComplete, submitting }: Props) {
  const limit = execution.contract.timeLimitSec ?? 0;
  const [elapsed, setElapsed] = useState(0);
  const [accuracy, setAccuracy] = useState(75);
  const [questions, setQuestions] = useState(execution.contract.questionCount ?? 10);

  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, limit - elapsed);
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const name = DISPLAY_NAME[execution.type] ?? execution.type;

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">In progress</span>
      <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{name}</h2>
      <p className="mt-1 text-sm text-muted">{execution.contract.topic}</p>

      {limit > 0 && (
        <div className="mt-6 flex justify-center">
          <span className="font-mono text-5xl font-medium tabular-nums text-teal">
            {mm}:{ss}
          </span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {execution.contract.focusAreas.map(f => (
          <span key={f} className="rounded-full bg-tealSoft px-3 py-1 text-xs font-medium text-teal">
            {f}
          </span>
        ))}
      </div>

      {/* Feature 5 stand-in — see backend/src/integrations/stubs.ts */}
      <div className="mt-6 rounded-xl bg-paper p-4">
        <p className="text-xs leading-relaxed text-muted">
          This prototype doesn't have real question content (that's Feature 5's job — see the README). Enter a result
          below to simulate finishing the {name.toLowerCase()}, the same shape Feature 5 would report back.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="text-xs text-muted">
            Accuracy %
            <input
              type="number"
              min={0}
              max={100}
              value={accuracy}
              onChange={e => setAccuracy(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-ink"
            />
          </label>
          <label className="text-xs text-muted">
            Questions completed
            <input
              type="number"
              min={0}
              value={questions}
              onChange={e => setQuestions(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-sm text-ink"
            />
          </label>
        </div>
      </div>

      <button
        onClick={() => onComplete({ accuracyPct: accuracy, questionsCompleted: questions })}
        disabled={submitting}
        className="mt-5 w-full rounded-xl bg-teal py-3 text-center font-display text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Finish & submit result'}
      </button>
    </div>
  );
}
