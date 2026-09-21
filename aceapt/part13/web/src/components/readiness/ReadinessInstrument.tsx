import { DIMENSION_LABELS } from "../../lib/format";
import type { DimensionScore } from "../../lib/types";

const SIZE = 480;
const CENTER = SIZE / 2;
const MAX_R = 160;
const RINGS = [25, 50, 75, 100];

function statusHex(status: DimensionScore["status"]): string {
  if (status === "READY") return "#4FD1A5";
  if (status === "HIGH_RISK") return "#E0667A";
  return "#E3A857";
}

export function ReadinessInstrument({ dimensions }: { dimensions: DimensionScore[] }) {
  const n = dimensions.length;
  const angleFor = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const pointFor = (i: number, value: number): [number, number] => {
    const r = (Math.max(0, Math.min(100, value)) / 100) * MAX_R;
    const a = angleFor(i);
    return [CENTER + r * Math.cos(a), CENTER + r * Math.sin(a)];
  };

  const polygonPoints = dimensions.map((d, i) => pointFor(i, d.score).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto" role="img" aria-label="Readiness across twelve dimensions">
      {RINGS.map((ring) => (
        <circle
          key={ring}
          cx={CENTER}
          cy={CENTER}
          r={(ring / 100) * MAX_R}
          fill="none"
          stroke="#25314A"
          strokeWidth={ring === 100 ? 1.25 : 1}
          strokeDasharray={ring === 100 ? undefined : "2 5"}
        />
      ))}
      {RINGS.map((ring) => (
        <text
          key={`rl-${ring}`}
          x={CENTER + 5}
          y={CENTER - (ring / 100) * MAX_R - 3}
          fontSize="9"
          fill="#3A4A68"
          fontFamily="IBM Plex Mono, monospace"
        >
          {ring}
        </text>
      ))}

      {dimensions.map((d, i) => {
        const [x, y] = pointFor(i, 100);
        return <line key={`spoke-${d.dimensionKey}`} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#1A2537" strokeWidth="1" />;
      })}

      <polygon points={polygonPoints} fill="#4FD1A5" fillOpacity="0.07" stroke="#4FD1A5" strokeOpacity="0.55" strokeWidth="1.5" />

      {dimensions.map((d, i) => {
        const [x, y] = pointFor(i, d.score);
        return (
          <circle
            key={`pt-${d.dimensionKey}`}
            cx={x}
            cy={y}
            r={d.confidence === "LOW" ? 3 : 4.5}
            fill={statusHex(d.status)}
            fillOpacity={d.confidence === "LOW" ? 0.5 : 1}
            stroke="#0B1220"
            strokeWidth="1.5"
          />
        );
      })}

      {dimensions.map((d, i) => {
        const a = angleFor(i);
        const labelR = MAX_R + 34;
        const x = CENTER + labelR * Math.cos(a);
        const y = CENTER + labelR * Math.sin(a);
        const cos = Math.cos(a);
        const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        return (
          <g key={`label-${d.dimensionKey}`}>
            <text x={x} y={y - 3} textAnchor={anchor} fontSize="10.5" fontWeight={500} fill="#C4CEDD" fontFamily="IBM Plex Sans, sans-serif">
              {DIMENSION_LABELS[d.dimensionKey]}
            </text>
            <text
              x={x}
              y={y + 11}
              textAnchor={anchor}
              fontSize="10.5"
              fill={statusHex(d.status)}
              fontFamily="IBM Plex Mono, monospace"
            >
              {d.score.toFixed(0)}
            </text>
          </g>
        );
      })}

      <circle cx={CENTER} cy={CENTER} r="2" fill="#8794A8" />
    </svg>
  );
}
