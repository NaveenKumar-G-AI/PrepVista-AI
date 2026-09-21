import type { VerificationFactor } from '../api/types.js';

export interface EvidenceStackVisualProps {
  factors: VerificationFactor[];
  /** Renders the small seal glyph when every factor clears its threshold. */
  sealed: boolean;
}

const WIDTH = 640;
const HEIGHT = 240;
const TRACK_TOP = 24;
const TRACK_HEIGHT = 150;
const BAR_WIDTH = 46;
const LABEL_Y = TRACK_TOP + TRACK_HEIGHT + 26;
const SCORE_Y = LABEL_Y + 20;

/** A row of measured bars crossing a threshold tick per dimension — the
 *  literal metaphor of the whole feature (evidence stacking up to clear a
 *  required bar), not a generic bar chart or radar. Every visual property
 *  maps to a real number from `factors`; nothing here is decorative. */
export function EvidenceStackVisual({ factors, sealed }: EvidenceStackVisualProps) {
  const n = Math.max(factors.length, 1);
  const gap = (WIDTH - n * BAR_WIDTH) / (n + 1);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Evidence by dimension: ${factors.map((f) => `${f.name} ${(f.score * 100).toFixed(0)} percent, ${f.meetsRequirement ? 'meets' : 'below'} requirement`).join('; ')}`}
      style={{ width: '100%', height: 'auto', overflow: 'visible' }}
    >
      {factors.map((f, i) => {
        const x = gap + i * (BAR_WIDTH + gap);
        const fillHeight = Math.max(2, f.score * TRACK_HEIGHT);
        const fillY = TRACK_TOP + TRACK_HEIGHT - fillHeight;
        const thresholdY = TRACK_TOP + TRACK_HEIGHT - f.threshold * TRACK_HEIGHT;
        const barColor = f.meetsRequirement ? 'var(--proof-verified)' : 'var(--proof-gap)';

        return (
          <g key={f.name}>
            {/* track */}
            <rect
              x={x} y={TRACK_TOP} width={BAR_WIDTH} height={TRACK_HEIGHT}
              fill="var(--proof-evidence-empty)" rx={2}
            />
            {/* fill, up to the measured score */}
            <rect x={x} y={fillY} width={BAR_WIDTH} height={fillHeight} fill={barColor} rx={2} />
            {/* threshold tick — the requirement this bar must clear */}
            <line
              x1={x - 4} x2={x + BAR_WIDTH + 4} y1={thresholdY} y2={thresholdY}
              stroke="var(--proof-ink-soft)" strokeWidth={2} strokeDasharray="4 3"
            />
            {/* dimension label */}
            <text
              x={x + BAR_WIDTH / 2} y={LABEL_Y} textAnchor="middle"
              className="proof-display" fontSize={12} fill="var(--proof-ink)"
            >
              {f.name}
            </text>
            {/* measured score */}
            <text
              x={x + BAR_WIDTH / 2} y={SCORE_Y} textAnchor="middle"
              className="proof-numeric" fontSize={12} fill="var(--proof-ink-soft)"
            >
              {`${(f.score * 100).toFixed(0)}%`}
            </text>
          </g>
        );
      })}

      {sealed && (
        <g transform={`translate(${WIDTH - 34}, 6)`} aria-hidden="true">
          <circle cx={10} cy={10} r={11} fill="var(--proof-verified)" />
          <path d="M5 10.5 L8.5 14 L15.5 6.5" stroke="var(--proof-paper-raised)" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}
