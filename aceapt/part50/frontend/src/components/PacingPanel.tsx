import React from 'react';
import { PacingSummary } from '../types/speed';

export interface PacingPanelProps {
  summary: PacingSummary;
  questionsCompleted: number;
  totalQuestions: number;
  elapsedMs: number;
  timeBudgetMs: number;
}

const STATUS_LABEL: Record<PacingSummary['paceStatus'], string> = {
  AHEAD: 'Ahead of pace',
  ON_TRACK: 'On pace',
  BEHIND: 'Behind pace',
};

/** Spec 63-65: shows elapsed/remaining/completed/pace/accuracy together,
 * and the message always cross-checks pace against accuracy rather than
 * pushing raw speed. */
export function PacingPanel({ summary, questionsCompleted, totalQuestions, elapsedMs, timeBudgetMs }: PacingPanelProps) {
  const remainingMs = Math.max(0, timeBudgetMs - elapsedMs);
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Pacing</p>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{STATUS_LABEL[summary.paceStatus]}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-slate-400">Completed</p>
          <p className="font-mono tabular-nums text-slate-800">
            {questionsCompleted} / {totalQuestions}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Time remaining</p>
          <p className="font-mono tabular-nums text-slate-800">
            {remainingMin}:{String(remainingSec).padStart(2, '0')}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Accuracy</p>
          <p className="font-mono tabular-nums text-slate-800">{Math.round(summary.accuracy * 100)}%</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-600">{summary.message}</p>
    </div>
  );
}

export default PacingPanel;
