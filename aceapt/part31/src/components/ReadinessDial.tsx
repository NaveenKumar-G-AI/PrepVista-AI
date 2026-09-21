'use client';

const SIZE = 220;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const START_ANGLE = -220; // degrees
const SWEEP = 260; // total arc sweep in degrees

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function ReadinessDial({ value, threshold, colorClass = 'text-signal' }: { value: number; threshold: number; colorClass?: string }) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const valueAngle = START_ANGLE + (value / 100) * SWEEP;
  const thresholdAngle = START_ANGLE + (threshold / 100) * SWEEP;
  const trackPath = arcPath(cx, cy, RADIUS, START_ANGLE, START_ANGLE + SWEEP);
  // Only drawn when there's a non-zero value — a zero-length arc with
  // round linecaps renders as a stray dot.
  const valuePath = value > 0 ? arcPath(cx, cy, RADIUS, START_ANGLE, valueAngle) : null;
  const tickInner = polarToCartesian(cx, cy, RADIUS - STROKE / 2 - 6, thresholdAngle);
  const tickOuter = polarToCartesian(cx, cy, RADIUS + STROKE / 2 + 6, thresholdAngle);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Simulated readiness ${value}%, target threshold ${threshold}%`}>
        <path d={trackPath} fill="none" stroke="#232833" strokeWidth={STROKE} strokeLinecap="round" />
        <line x1={tickInner.x} y1={tickInner.y} x2={tickOuter.x} y2={tickOuter.y} stroke="#5C6577" strokeWidth={2} strokeDasharray="2 3" />
        {valuePath && (
          <path
            d={valuePath}
            fill="none"
            stroke="currentColor"
            className={`${colorClass} animate-drawArc`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={1000}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-data text-5xl font-semibold tracking-tightest text-text-1">{value}%</span>
        <span className="eyebrow mt-1">SIMULATED READINESS</span>
        <span className="mt-2 font-data text-xs text-text-3">target {threshold}%</span>
      </div>
    </div>
  );
}
