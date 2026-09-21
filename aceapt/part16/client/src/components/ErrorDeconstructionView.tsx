import { Check, X } from 'lucide-react';
import { ErrorDeconstructionResult } from '../types';

export function ErrorDeconstructionView({ result }: { result: ErrorDeconstructionResult }) {
  if (!result.available) {
    return (
      <div className="rounded-md border border-line bg-surface p-5 text-[13px] text-muted">
        {result.reason ?? 'No step-level evidence was captured for this attempt.'}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line bg-surface shadow-panel">
      <div className="border-b border-line px-5 py-3">
        <p className="font-display text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Your approach</p>
      </div>

      <ol className="px-5 py-2">
        {result.steps?.map((s) => (
          <li key={s.stepNumber} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
            <span
              className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${
                s.correct ? 'bg-signal-tealSoft text-signal-teal' : 'bg-signal-roseSoft text-signal-rose'
              }`}
            >
              {s.correct ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
            </span>
            <span className="text-[14px] leading-snug text-ink">
              <span className="mr-1.5 font-mono text-[11px] text-muted">Step {s.stepNumber}</span>
              {s.description}
            </span>
          </li>
        ))}
      </ol>

      {result.errorStep && (
        <div className="mx-5 mb-5 space-y-3 rounded-md bg-porcelain px-4 py-3.5">
          <p className="text-[13px] font-medium text-ink">
            Your approach was correct through step {result.correctThroughStep}.
          </p>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-signal-rose">Why it likely failed</p>
            <p className="text-[13px] leading-relaxed text-ink-soft">{result.why}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-signal-teal">How to avoid it next time</p>
            <p className="text-[13px] leading-relaxed text-ink-soft">{result.howToAvoid}</p>
          </div>
        </div>
      )}
    </div>
  );
}
