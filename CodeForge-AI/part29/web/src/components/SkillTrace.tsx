import type { SnapshotPoint } from "../api.js";

interface Milestone {
  type: string;
  achieved_at: string;
}

interface Props {
  points: SnapshotPoint[];
  milestones: Milestone[];
  confidence: string;
  positive: boolean;
  width?: number;
  height?: number;
}

const CONFIDENCE_STROKE: Record<string, { width: number; dash?: string }> = {
  HIGH: { width: 2.75 },
  MODERATE: { width: 2 },
  LOW: { width: 1.5, dash: "5 4" },
  INSUFFICIENT: { width: 1.25, dash: "1.5 3.5" },
};

/**
 * Renders a skill's value-over-time series as a literal trace line, the way
 * an oscilloscope or seismograph would — because the point of this product
 * is "how did capability actually move", and a line is a more honest
 * representation of that than a bar or a single delta number. Line weight
 * and dash pattern encode confidence directly on the trace, so confidence
 * is never something a viewer can miss the way a small badge can go
 * unnoticed. Milestones appear as ticks on the line at the moment they
 * happened, not as a disconnected list.
 */
export function SkillTrace({ points, milestones, confidence, positive, width = 320, height = 56 }: Props) {
  const padX = 6;
  const padY = 8;

  if (points.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-14">
        <line x1={padX} y1={height / 2} x2={width - padX} y2={height / 2} stroke="#D8DAD2" strokeWidth={1.5} strokeDasharray="2 4" />
        <text x={padX} y={height / 2 - 8} fontSize="10" fill="#8A8D85" fontFamily="IBM Plex Mono, monospace">
          not enough evidence yet
        </text>
      </svg>
    );
  }

  const times = points.map((p) => new Date(p.observed_at).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const span = tMax - tMin || 1;

  const x = (t: number) => padX + ((t - tMin) / span) * (width - padX * 2);
  const y = (v: number) => padY + (1 - v / 100) * (height - padY * 2);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(new Date(p.observed_at).getTime()).toFixed(1)} ${y(Number(p.value)).toFixed(1)}`)
    .join(" ");

  const stroke = positive ? "#3C6E47" : "#9B3B3B";
  const strokeStyle = CONFIDENCE_STROKE[confidence] ?? CONFIDENCE_STROKE.LOW;

  const last = points[points.length - 1]!;
  const lastX = x(new Date(last.observed_at).getTime());
  const lastY = y(Number(last.value));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-14" role="img" aria-label="Skill trajectory over time">
      {/* baseline reference grid at 0/50/100 */}
      {[0, 50, 100].map((v) => (
        <line key={v} x1={padX} y1={y(v)} x2={width - padX} y2={y(v)} stroke="#D8DAD2" strokeWidth={0.5} />
      ))}

      <path d={path} fill="none" stroke={stroke} strokeWidth={strokeStyle.width} strokeDasharray={strokeStyle.dash} strokeLinecap="round" strokeLinejoin="round" />

      {milestones.map((m, i) => {
        const t = new Date(m.achieved_at).getTime();
        if (t < tMin || t > tMax) return null;
        return (
          <g key={i} transform={`translate(${x(t)}, ${height - 3})`}>
            <path d="M 0 -4 L 3 0 L 0 4 L -3 0 Z" fill="#A8791F" />
          </g>
        );
      })}

      <circle cx={lastX} cy={lastY} r={3} fill={stroke} />
    </svg>
  );
}
