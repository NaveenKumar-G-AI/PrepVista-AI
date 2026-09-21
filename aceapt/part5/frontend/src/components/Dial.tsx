import { useEffect, useState } from "react";

interface DialProps {
  /** 0-100 */
  value: number;
  label: string;
  sublabel?: string;
  size?: number;
  accent?: string;
}

const START_ANGLE = -125;
const END_ANGLE = 125;
const SWEEP = END_ANGLE - START_ANGLE;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** A calibration-gauge style radial dial. Used at two scales: full-size on the
 * dashboard for Accuracy/Speed/Consistency, and compact during a practice
 * session as the live difficulty indicator — same visual language, same
 * component, so the product reads as one coherent instrument. */
export function Dial({ value, label, sublabel, size = 132, accent = "#2E9C90" }: DialProps) {
  const [animated, setAnimated] = useState(0);
  const clamped = Math.max(0, Math.min(100, value));

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimated(clamped));
    return () => cancelAnimationFrame(raf);
  }, [clamped]);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 14;
  const needleAngle = START_ANGLE + (animated / 100) * SWEEP;
  const needleTip = polar(cx, cy, r - 10, needleAngle);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(clamped)}`}>
        <path d={arcPath(cx, cy, r, START_ANGLE, END_ANGLE)} fill="none" stroke="#E2E6E1" strokeWidth={8} strokeLinecap="round" />
        <path
          d={arcPath(cx, cy, r, START_ANGLE, START_ANGLE + (animated / 100) * SWEEP)}
          fill="none"
          stroke={accent}
          strokeWidth={8}
          strokeLinecap="round"
          style={{ transition: "d 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        {Array.from({ length: 9 }).map((_, i) => {
          const angle = START_ANGLE + (i / 8) * SWEEP;
          const outer = polar(cx, cy, r + 8, angle);
          const inner = polar(cx, cy, r + 2, angle);
          return <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#B9C0BA" strokeWidth={1.5} />;
        })}
        <line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="#10233F"
          strokeWidth={2.5}
          strokeLinecap="round"
          style={{ transition: "all 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        <circle cx={cx} cy={cy} r={4} fill="#10233F" />
        <text x={cx} y={cy + r / 2 + 6} textAnchor="middle" className="fill-ink-900" fontFamily="'Space Grotesk', sans-serif" fontSize={size * 0.16} fontWeight={600}>
          {Math.round(clamped)}
        </text>
      </svg>
      <div className="text-center">
        <div className="font-body text-sm font-medium text-ink-700">{label}</div>
        {sublabel && <div className="font-mono text-[11px] text-ink-700/60">{sublabel}</div>}
      </div>
    </div>
  );
}

/** Compact variant used inline during a practice session to show where the
 * current question sits on the Foundation→Expert ladder — the same dial
 * language, scaled down, driven by an 8-step index instead of a percentage. */
export function DifficultyDial({ level, size = 56 }: { level: number; size?: number }) {
  const value = (level / 7) * 100;
  return <Dial value={value} label="" size={size} accent="#D98E2B" />;
}
