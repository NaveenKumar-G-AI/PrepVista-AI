import type { StudentDifficultyResponse } from '../lib/api.js';

const COPY: Record<string, { label: string; note: string; color: string; bg: string }> = {
  STRETCH: {
    label: 'Stretch question',
    note: 'A step above your current demonstrated level.',
    color: '#8C6A3F',
    bg: '#F1EAE0',
  },
  AT_LEVEL: {
    label: 'At your level',
    note: 'Matched to where you are right now.',
    color: '#3D6B63',
    bg: '#E4EDE9',
  },
  BELOW_LEVEL: {
    label: 'Warm-up question',
    note: 'Below your demonstrated level — good for a quick win.',
    color: '#5B655D',
    bg: '#EEEFEC',
  },
};

/**
 * §79, §116, §171: personal challenge is a relationship between the
 * question's GLOBAL category and this student's own level — it never
 * changes the question's calibration, only how it's framed here.
 */
export function PersonalChallengeBadge({ data }: { data: StudentDifficultyResponse }) {
  const key = data.personalChallenge;
  if (!key || !COPY[key]) return null;
  const c = COPY[key];
  return (
    <div
      className="inline-flex flex-col gap-0.5 rounded border px-3 py-2"
      style={{ borderColor: c.color, backgroundColor: c.bg }}
    >
      <span className="font-display text-sm" style={{ color: c.color }}>
        {c.label}
      </span>
      <span className="text-xs text-ink-soft">{c.note}</span>
    </div>
  );
}
