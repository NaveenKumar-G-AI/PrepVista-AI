import { useMemo } from 'react';

export interface DifficultyGaugeProps {
  /** 0 (Easy end) .. 1 (Hard end) — this is DIFFICULTY position, i.e. 1 - facility. */
  position: number;
  /** Optional uncertainty band, same 0..1 scale as position. */
  bandLow?: number;
  bandHigh?: number;
  category: 'EASY' | 'MEDIUM' | 'HARD' | null;
  size?: number;
  /** When true, renders compact enough to sit inline next to a line of text. */
  compact?: boolean;
}

const CATEGORY_COLOR: Record<string, string> = {
  EASY: '#3D6B63',
  MEDIUM: '#A67C1E',
  HARD: '#9C4A3C',
};

function polarPoint(cx: number, cy: number, r: number, t: number) {
  // t: 0 = Easy (left, 180deg) .. 1 = Hard (right, 0deg), arc bows upward.
  const angleDeg = 180 - 180 * t;
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy - r * Math.sin(angleRad) };
}

function arcPath(cx: number, cy: number, r: number, tStart: number, tEnd: number) {
  const start = polarPoint(cx, cy, r, tStart);
  const end = polarPoint(cx, cy, r, tEnd);
  const largeArc = tEnd - tStart > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * The one deliberately bold element in this UI (per the design brief: spend
 * boldness in one place) — every other surface stays quiet hairlines and
 * mono numerals around this dial. Reads as a calibration instrument: a
 * needle position plus an uncertainty band, not a decorative progress ring.
 */
export function DifficultyGauge({
  position,
  bandLow,
  bandHigh,
  category,
  size = 120,
  compact = false,
}: DifficultyGaugeProps) {
  const cx = size / 2;
  const cy = size / 2 + size * 0.08;
  const r = size * 0.42;
  const clamped = Math.max(0, Math.min(1, position));
  const needle = polarPoint(cx, cy, r * 0.92, clamped);
  const color = category ? CATEGORY_COLOR[category] : '#5B655D';

  const ticks = useMemo(() => [0, 1 / 3, 2 / 3, 1], []);

  return (
    <svg
      width={size}
      height={size * 0.66}
      viewBox={`0 0 ${size} ${size * 0.62}`}
      role="img"
      aria-label={`Difficulty gauge${category ? `, ${category.toLowerCase()}` : ''}`}
    >
      {/* base track */}
      <path d={arcPath(cx, cy, r, 0, 1)} fill="none" stroke="#DCE0D8" strokeWidth={compact ? 6 : 8} strokeLinecap="round" />

      {/* uncertainty band */}
      {bandLow !== undefined && bandHigh !== undefined && (
        <path
          d={arcPath(cx, cy, r, Math.max(0, bandLow), Math.min(1, bandHigh))}
          fill="none"
          stroke={color}
          strokeOpacity={0.28}
          strokeWidth={compact ? 6 : 8}
          strokeLinecap="round"
        />
      )}

      {/* tick marks at category boundaries */}
      {ticks.map((t) => {
        const inner = polarPoint(cx, cy, r - 6, t);
        const outer = polarPoint(cx, cy, r + 6, t);
        return (
          <line key={t} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#8C6A3F" strokeWidth={1.5} />
        );
      })}

      {/* needle */}
      <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4} fill={color} />

      {!compact && (
        <>
          <text x={cx - r - 2} y={cy + 16} fontSize={10} fill="#5B655D" fontFamily="IBM Plex Mono, monospace" textAnchor="start">
            EASY
          </text>
          <text x={cx + r + 2} y={cy + 16} fontSize={10} fill="#5B655D" fontFamily="IBM Plex Mono, monospace" textAnchor="end">
            HARD
          </text>
        </>
      )}
    </svg>
  );
}
