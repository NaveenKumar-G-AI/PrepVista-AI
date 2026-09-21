import type { DifficultyBoundary, QuestionDifficulty } from "../../src/types/domain.js";

const BAND_ORDER: QuestionDifficulty[] = ["easy", "medium", "hard", "very_hard"];
const BAND_LABEL: Record<QuestionDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard", very_hard: "Very hard" };

const CHART_LEFT = 78;
const CHART_RIGHT = 600;
const CHART_TOP = 24;
const CHART_BOTTOM = 172;

function xForIndex(index: number, count: number): number {
  if (count <= 1) return (CHART_LEFT + CHART_RIGHT) / 2;
  return CHART_LEFT + (index / (count - 1)) * (CHART_RIGHT - CHART_LEFT);
}

function yForAccuracy(accuracy: number): number {
  return CHART_BOTTOM - accuracy * (CHART_BOTTOM - CHART_TOP);
}

/**
 * Module 53: "Do not create charts merely for decoration." This exists
 * because Module 17's difficulty-boundary finding is the single most
 * information-dense insight the diagnostic produces — a shape communicates
 * "strong foundation, breaks down under load" far faster than four numbers
 * in a row, and the one callout marker is the only thing doing decorative
 * work, pointing at the one fact that matters.
 */
export function CapabilitySkyline({ boundary, title }: { boundary: DifficultyBoundary; title: string }) {
  const present = BAND_ORDER.filter((b) => boundary.accuracyByDifficulty[b] !== undefined);

  if (present.length === 0) {
    return (
      <div style={{ fontFamily: "var(--diag-font-body)", color: "var(--diag-ink-faint)", fontSize: "0.9rem", padding: "1rem 0" }}>
        Not enough evidence yet across difficulty levels to plot {title.toLowerCase()}.
      </div>
    );
  }

  const points = present.map((band, i) => ({
    band,
    x: xForIndex(i, present.length),
    y: yForAccuracy(boundary.accuracyByDifficulty[band]!),
    accuracy: boundary.accuracyByDifficulty[band]!,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]!.x} ${CHART_BOTTOM} L ${points[0]!.x} ${CHART_BOTTOM} Z`;

  // Find the steepest single-step drop, for the one annotated marker.
  let breakpoint: { from: (typeof points)[number]; to: (typeof points)[number]; drop: number } | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const drop = points[i]!.accuracy - points[i + 1]!.accuracy;
    if (boundary.boundaryDetected && (!breakpoint || drop > breakpoint.drop)) {
      breakpoint = { from: points[i]!, to: points[i + 1]!, drop };
    }
  }

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox="0 0 640 210" role="img" aria-label={`${title}: accuracy by difficulty — ${present.map((b) => `${BAND_LABEL[b]} ${Math.round(boundary.accuracyByDifficulty[b]! * 100)} percent`).join(", ")}`} style={{ width: "100%", height: "auto" }}>
        {/* baseline + reference ticks */}
        <line x1={CHART_LEFT} y1={CHART_BOTTOM} x2={CHART_RIGHT} y2={CHART_BOTTOM} stroke="var(--diag-line)" strokeWidth="1" />
        <line x1={CHART_LEFT} y1={CHART_TOP} x2={CHART_RIGHT} y2={CHART_TOP} stroke="var(--diag-line)" strokeWidth="1" strokeDasharray="2 4" />
        <text x={CHART_LEFT - 10} y={CHART_BOTTOM + 4} textAnchor="end" fontFamily="var(--diag-font-mono)" fontSize="11" fill="var(--diag-ink-faint)">0%</text>
        <text x={CHART_LEFT - 10} y={CHART_TOP + 4} textAnchor="end" fontFamily="var(--diag-font-mono)" fontSize="11" fill="var(--diag-ink-faint)">100%</text>

        {/* the skyline */}
        <path d={areaPath} fill="var(--diag-brass-soft)" opacity="0.6" />
        <path d={linePath} fill="none" stroke="var(--diag-brass)" strokeWidth="2.5" strokeLinejoin="round" />

        {points.map((p) => (
          <g key={p.band}>
            <line x1={p.x} y1={CHART_BOTTOM} x2={p.x} y2={CHART_BOTTOM + 8} stroke="var(--diag-line)" strokeWidth="1" />
            <circle cx={p.x} cy={p.y} r="4.5" fill="var(--diag-paper)" stroke="var(--diag-brass)" strokeWidth="2.5" />
            <text x={p.x} y={CHART_BOTTOM + 24} textAnchor="middle" fontFamily="var(--diag-font-body)" fontSize="12" fill="var(--diag-ink-soft)">
              {BAND_LABEL[p.band]}
            </text>
            <text x={p.x} y={p.y - 12} textAnchor="middle" fontFamily="var(--diag-font-mono)" fontSize="12" fontWeight="600" fill="var(--diag-ink)">
              {Math.round(p.accuracy * 100)}%
            </text>
          </g>
        ))}

        {breakpoint && (
          <g>
            <line
              x1={(breakpoint.from.x + breakpoint.to.x) / 2}
              y1={Math.min(breakpoint.from.y, breakpoint.to.y) - 22}
              x2={(breakpoint.from.x + breakpoint.to.x) / 2}
              y2={Math.max(breakpoint.from.y, breakpoint.to.y) + 4}
              stroke="var(--diag-clay)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x={(breakpoint.from.x + breakpoint.to.x) / 2}
              y={Math.min(breakpoint.from.y, breakpoint.to.y) - 28}
              textAnchor="middle"
              fontFamily="var(--diag-font-mono)"
              fontSize="11"
              fill="var(--diag-clay)"
            >
              breakdown point
            </text>
          </g>
        )}
      </svg>
    </figure>
  );
}
