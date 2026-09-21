import { fmtDate } from "../../lib/format";
import type { TrendPoint } from "../../lib/types";

const W = 640;
const H = 180;
const PAD_L = 32;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;

export function ReadinessJourneyChart({ trend }: { trend: TrendPoint[] }) {
  if (trend.length === 0) {
    return <div className="text-sm text-paper-500 py-10 text-center">No readiness history yet.</div>;
  }

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xFor = (i: number) => PAD_L + (trend.length === 1 ? innerW / 2 : (i / (trend.length - 1)) * innerW);
  const yFor = (score: number) => PAD_T + innerH - (score / 100) * innerH;

  const linePath = trend.map((t, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(t.overallScore)}`).join(" ");
  const areaPath = `${linePath} L ${xFor(trend.length - 1)} ${PAD_T + innerH} L ${xFor(0)} ${PAD_T + innerH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={PAD_L} x2={W - PAD_R} y1={yFor(g)} y2={yFor(g)} stroke="#1A2537" strokeWidth="1" strokeDasharray={g === 0 ? undefined : "2 5"} />
          <text x={4} y={yFor(g) + 3} fontSize="9" fill="#3A4A68" fontFamily="IBM Plex Mono, monospace">
            {g}
          </text>
        </g>
      ))}

      <path d={areaPath} fill="#4FD1A5" fillOpacity="0.06" stroke="none" />
      <path d={linePath} fill="none" stroke="#4FD1A5" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />

      {trend.map((t, i) => (
        <g key={t.createdAt}>
          <circle cx={xFor(i)} cy={yFor(t.overallScore)} r="3.5" fill="#0B1220" stroke="#4FD1A5" strokeWidth="1.75" />
          {(i === trend.length - 1 || i === 0 || trend.length <= 6) && (
            <text
              x={xFor(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === trend.length - 1 ? "end" : "middle"}
              fontSize="9"
              fill="#8794A8"
              fontFamily="IBM Plex Mono, monospace"
            >
              {fmtDate(t.createdAt)}
            </text>
          )}
        </g>
      ))}

      <text
        x={xFor(trend.length - 1)}
        y={yFor(trend[trend.length - 1]!.overallScore) - 10}
        textAnchor="end"
        fontSize="12"
        fontWeight={600}
        fill="#4FD1A5"
        fontFamily="IBM Plex Mono, monospace"
      >
        {trend[trend.length - 1]!.overallScore.toFixed(0)}
      </text>
    </svg>
  );
}
