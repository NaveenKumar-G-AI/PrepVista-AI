import { DifficultyGauge } from './DifficultyGauge.js';
import type { StudentDifficultyResponse } from '../lib/api.js';

const CATEGORY_LABEL: Record<string, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

const POSITION: Record<string, number> = { EASY: 0.12, MEDIUM: 0.5, HARD: 0.88 };

/**
 * Student-facing (§115, §170): a category and nothing else. No facility, no
 * sample size, no confidence label with a decimal in it — the DB itself
 * won't hand this component anything more (see student_difficulty_view),
 * so there's nothing to accidentally over-share here even by mistake.
 */
export function DifficultyBadge({ data }: { data: StudentDifficultyResponse }) {
  if (!data.category) {
    return (
      <div className="inline-flex items-center gap-2 rounded border border-grid bg-panel px-3 py-1.5 text-sm text-ink-soft">
        <span className="font-mono text-xs">—</span>
        <span>Difficulty not yet available</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-3 rounded border border-grid bg-panel px-3 py-2">
      <DifficultyGauge position={POSITION[data.category]} category={data.category} size={56} compact />
      <div className="leading-tight">
        <div className="font-display text-base text-ink">{CATEGORY_LABEL[data.category]}</div>
        <div className="font-mono text-[11px] text-ink-soft">
          {data.provisional ? 'still calibrating' : data.recommended ? 'well established' : 'early read'}
        </div>
      </div>
    </div>
  );
}
