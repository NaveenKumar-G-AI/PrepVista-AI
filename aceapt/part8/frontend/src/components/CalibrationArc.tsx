interface CalibrationArcProps {
  label: string;
  value: number | null; // 0-1
  threshold?: number; // 0-1
  size?: "sm" | "md" | "lg";
  tone?: "verified" | "provisional" | "caution" | "regressed" | "neutral";
  formatValue?: (v: number) => string;
}

const SIZE_MAP = {
  sm: { box: 96, r: 34, stroke: 6, labelSize: 10, valueSize: 15 },
  md: { box: 148, r: 54, stroke: 8, labelSize: 12, valueSize: 22 },
  lg: { box: 220, r: 82, stroke: 11, labelSize: 14, valueSize: 34 },
};

const TONE_COLOR: Record<NonNullable<CalibrationArcProps["tone"]>, string> = {
  verified: "#0E6E5C",
  provisional: "#3E5C76",
  caution: "#A8712A",
  regressed: "#9B4A3F",
  neutral: "#8792A2",
};

/** angle 180 = left end, 90 = top, 0 = right end. SVG y is flipped, so y
 *  subtracts the sine term to make the arc bow upward through the top. */
function pointOnArc(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const start = pointOnArc(cx, cy, r, fromDeg);
  const end = pointOnArc(cx, cy, r, toDeg);
  const sweepDeg = fromDeg - toDeg;
  const largeArcFlag = sweepDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

/**
 * A graduated semicircular gauge: evidence fills toward a threshold tick,
 * not toward "100% happy face". Used identically at every scale in the app
 * (a small multiple in a skill card, a full hero after a verification
 * session) so the one deliberately bold visual device stays legible as the
 * same idea throughout: this number is a measurement, checked against a
 * line, not a decoration.
 */
export function CalibrationArc({ label, value, threshold, size = "md", tone = "neutral", formatValue }: CalibrationArcProps) {
  const { box, r, stroke, labelSize, valueSize } = SIZE_MAP[size];
  const cx = box / 2;
  const cy = box / 2 + r / 2.6;
  const color = TONE_COLOR[tone];
  const clamped = value === null || value === undefined ? null : Math.max(0, Math.min(1, value));
  const fillEndAngle = clamped === null ? 180 : 180 - clamped * 180;
  const thresholdAngle = threshold !== undefined ? 180 - Math.max(0, Math.min(1, threshold)) * 180 : null;

  const display = clamped === null ? "-" : formatValue ? formatValue(clamped) : Math.round(clamped * 100).toString();

  return (
    <div className="inline-flex flex-col items-center" style={{ width: box }}>
      <svg width={box} height={box / 1.62} viewBox={`0 0 ${box} ${box / 1.62}`}>
        {/* track */}
        <path d={arcPath(cx, cy, r, 180, 0)} fill="none" stroke="#DADFDC" strokeWidth={stroke} strokeLinecap="round" />
        {/* ticks every 25% */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const angle = 180 - t * 180;
          const inner = pointOnArc(cx, cy, r - stroke / 2 - 3, angle);
          const outer = pointOnArc(cx, cy, r + stroke / 2 + 3, angle);
          return <line key={t} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#C3C9C4" strokeWidth={1} />;
        })}
        {/* fill */}
        {clamped !== null && clamped > 0 && (
          <path d={arcPath(cx, cy, r, 180, fillEndAngle)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        )}
        {/* threshold marker */}
        {thresholdAngle !== null && (
          <line
            x1={pointOnArc(cx, cy, r - stroke - 2, thresholdAngle).x}
            y1={pointOnArc(cx, cy, r - stroke - 2, thresholdAngle).y}
            x2={pointOnArc(cx, cy, r + stroke + 2, thresholdAngle).x}
            y2={pointOnArc(cx, cy, r + stroke + 2, thresholdAngle).y}
            stroke="#16233A"
            strokeWidth={2}
          />
        )}
        <text x={cx} y={cy - 2} textAnchor="middle" className="font-mono tabular" fontSize={valueSize} fontWeight={600} fill="#16233A">
          {display}
        </text>
      </svg>
      <div className="font-sans uppercase tracking-wide text-ink-faint text-center leading-tight -mt-1" style={{ fontSize: labelSize }}>
        {label}
      </div>
    </div>
  );
}
