import React from 'react';

export interface TimeTargetProps {
  currentTargetMs: number;
  baselineMs: number;
}

/** Spec 27-28, 50, 111: always framed against the student's OWN baseline,
 * never a universal number. */
export function TimeTarget({ currentTargetMs, baselineMs }: TimeTargetProps) {
  const targetSec = Math.round(currentTargetMs / 1000);
  const baselineSec = Math.round(baselineMs / 1000);
  const improvedSec = baselineSec - targetSec;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">Your current target</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-slate-800 tabular-nums">{targetSec}s</p>
      <p className="mt-1 text-sm text-slate-500">
        Your baseline was <span className="font-medium text-slate-700">{baselineSec}s</span>
        {improvedSec > 0 && (
          <>
            {' '}
            - <span className="text-emerald-700">{improvedSec}s reclaimed</span> so far
          </>
        )}
      </p>
    </div>
  );
}

export default TimeTarget;
