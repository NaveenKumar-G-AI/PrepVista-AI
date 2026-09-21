import React, { useEffect, useState } from 'react';

export interface SpeedMeterProps {
  /** Elapsed time in ms, driven by the parent (SpeedTrainingSession). */
  elapsedMs: number;
  targetMs: number | null;
  /** Soft guidance only - never a hard cutoff unless the mode is STRICT_TIME/PLACEMENT_SIMULATION. */
  softLimit?: boolean;
}

function formatSeconds(ms: number): string {
  return `${Math.floor(ms / 1000)}s`;
}

/** Spec 90-91: clear, accessible, non-distracting. Status is always carried
 * by text, never by color alone, and there is no flashing/panic animation. */
export function SpeedMeter({ elapsedMs, targetMs, softLimit = true }: SpeedMeterProps) {
  const [announce, setAnnounce] = useState('');

  const overTarget = targetMs != null && elapsedMs > targetMs;
  const nearTarget = targetMs != null && !overTarget && elapsedMs > targetMs * 0.8;

  useEffect(() => {
    if (targetMs == null) return;
    const remaining = Math.round((targetMs - elapsedMs) / 1000);
    if ([20, 10].includes(remaining)) setAnnounce(`${remaining} seconds remaining`);
  }, [elapsedMs, targetMs]);

  const tone = overTarget ? 'text-amber-700 border-amber-300 bg-amber-50' : nearTarget ? 'text-slate-700 border-slate-300 bg-slate-50' : 'text-slate-700 border-slate-200 bg-white';

  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${tone}`} role="timer" aria-live="off">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 4.5V8L10.3 9.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span className="font-mono text-sm tabular-nums">{formatSeconds(elapsedMs)}</span>
      {targetMs != null && <span className="text-xs text-slate-400">/ {formatSeconds(targetMs)} target</span>}
      {overTarget && <span className="text-xs font-medium">past target - no penalty, keep going</span>}
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}

export default SpeedMeter;
