import React from 'react';

export interface AccuracyGuardrailProps {
  rollingAccuracy: number; // 0-1
  guardrail: number; // 0-1
}

/** Spec 29: makes the guardrail visible without shaming - status is always
 * carried in text, and the tone stays neutral even when below guardrail. */
export function AccuracyGuardrail({ rollingAccuracy, guardrail }: AccuracyGuardrailProps) {
  const pct = Math.round(rollingAccuracy * 100);
  const guardrailPct = Math.round(guardrail * 100);
  const breached = rollingAccuracy < guardrail;

  return (
    <div className="w-full max-w-xs">
      <div className="flex items-baseline justify-between text-xs text-slate-500">
        <span>Accuracy</span>
        <span className="tabular-nums">
          {pct}% <span className="text-slate-400">· guardrail {guardrailPct}%</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${breached ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
        />
        <div className="relative">
          <div
            className="absolute -mt-1.5 h-1.5 w-px bg-slate-400"
            style={{ left: `${guardrailPct}%` }}
            title={`Guardrail: ${guardrailPct}%`}
          />
        </div>
      </div>
      {breached && <p className="mt-1 text-xs text-amber-700">Below your guardrail right now - pace will ease automatically.</p>}
    </div>
  );
}

export default AccuracyGuardrail;
