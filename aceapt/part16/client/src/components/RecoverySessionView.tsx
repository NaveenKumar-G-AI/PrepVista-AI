import { Check } from 'lucide-react';
import { RecoverySession } from '../types';

interface Props {
  session: RecoverySession;
  onCompleteStep: (stepIndex: number) => void;
  onVerify?: () => void;
}

export function RecoverySessionView({ session, onCompleteStep, onVerify }: Props) {
  const allDone = session.status === 'completed';
  const currentIndex = session.steps.findIndex((s) => s.status === 'pending');

  return (
    <div className="rounded-md border border-line bg-surface shadow-panel">
      <div className="border-b border-line px-5 py-3">
        <p className="font-display text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Recovery session</p>
        <p className="mt-1 text-[13px] text-ink-soft">{session.triggeringPattern}</p>
      </div>

      <ol className="relative px-5 py-4">
        {session.steps.map((step, i) => {
          const isDone = step.status === 'completed';
          const isCurrent = i === currentIndex;
          return (
            <li key={step.index} className="relative flex gap-4 pb-6 last:pb-0">
              {i < session.steps.length - 1 && (
                <span className={`absolute left-[11px] top-6 h-full w-px ${isDone ? 'bg-signal-teal' : 'bg-line'}`} />
              )}
              <span
                className={`z-10 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 ${
                  isDone
                    ? 'border-signal-teal bg-signal-teal text-white'
                    : isCurrent
                    ? 'border-signal-gold bg-surface text-signal-gold'
                    : 'border-line bg-surface text-muted'
                }`}
              >
                {isDone ? <Check size={13} strokeWidth={3} /> : <span className="font-mono text-[11px]">{i + 1}</span>}
              </span>
              <div className="flex-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <p className={`text-[14px] font-medium ${isDone ? 'text-muted line-through' : 'text-ink'}`}>{step.title}</p>
                  <span className="font-mono text-[11px] text-muted">{step.estimatedMinutes} min</span>
                </div>
                {isCurrent && (
                  <button
                    onClick={() => onCompleteStep(step.index)}
                    className="mt-2 rounded-sm bg-ink px-3 py-1.5 font-body text-[12px] font-medium text-porcelain transition hover:bg-ink-soft"
                  >
                    Mark step complete
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {allDone && (
        <div className="border-t border-line px-5 py-4">
          <p className="mb-3 text-[13px] text-ink-soft">Let's verify whether the issue is resolved.</p>
          <button onClick={onVerify} className="rounded-sm bg-signal-teal px-3.5 py-2 font-body text-[13px] font-medium text-white transition hover:opacity-90">
            Verify now
          </button>
        </div>
      )}
    </div>
  );
}
