export function toTitleCase(s) {
  if (!s) return '';
  return s.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/*
 * TrendGlyph - the one signature visual element in this UI. Each of the
 * seven trajectory states gets its own small hand-drawn line shape rather
 * than a generic arrow icon or a color chip: the shape itself carries the
 * meaning (a steepening curve for ACCELERATING, a flat line near the bottom
 * with a slight jitter for STALLED, sparse dots for INSUFFICIENT_DATA), so
 * reading the glyph is reading the trend. It draws itself in on mount and
 * respects prefers-reduced-motion.
 */
const GLYPH_PATHS = {
  ACCELERATING: 'M4,30 C 30,26 55,20 70,10 C 80,4 88,2 96,2',
  IMPROVING: 'M4,32 C 26,26 50,18 74,10 C 82,7 90,5 96,4',
  STABLE: 'M4,8 C 20,6 35,10 50,8 C 65,6 80,9 96,7',
  SLOWING: 'M4,30 C 20,18 35,10 50,8 C 65,7 80,7 96,7',
  STALLED: 'M4,30 C 20,32 35,28 50,31 C 65,29 80,32 96,30',
  DECLINING: 'M4,6 C 26,12 50,20 74,28 C 82,31 90,33 96,35',
};

const TONE_BY_TREND = {
  ACCELERATING: 'positive',
  IMPROVING: 'positive',
  STABLE: 'neutral',
  SLOWING: 'caution',
  STALLED: 'caution',
  DECLINING: 'negative',
  INSUFFICIENT_DATA: 'neutral',
};

export function TrendGlyph({ trend, size = 'md' }) {
  const tone = TONE_BY_TREND[trend] || 'neutral';
  if (trend === 'INSUFFICIENT_DATA' || !GLYPH_PATHS[trend]) {
    return (
      <svg viewBox="0 0 100 40" className={`trend-glyph trend-glyph--${size} trend-glyph--${tone}`} aria-hidden="true">
        {[14, 38, 62, 86].map((cx, i) => (
          <circle key={i} cx={cx} cy={22 - (i % 2) * 6} r="2.6" fill="currentColor" opacity={0.55} />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 40" className={`trend-glyph trend-glyph--${size} trend-glyph--${tone}`} aria-hidden="true">
      <path d={GLYPH_PATHS[trend]} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

const TREND_LABEL = {
  ACCELERATING: 'Accelerating',
  IMPROVING: 'Improving',
  STABLE: 'Stable',
  SLOWING: 'Slowing',
  STALLED: 'Stalled',
  DECLINING: 'Declining',
  INSUFFICIENT_DATA: 'Insufficient data',
};

export function TrajectoryBadge({ trajectory, confidence }) {
  const tone = TONE_BY_TREND[trajectory] || 'neutral';
  return (
    <span className={`trajectory-badge trajectory-badge--${tone}`}>
      <TrendGlyph trend={trajectory} size="sm" />
      <span className="trajectory-badge__text">
        {TREND_LABEL[trajectory] || trajectory}
        {confidence && confidence !== 'INSUFFICIENT_DATA' && (
          <span className="trajectory-badge__confidence"> · {toTitleCase(confidence)} confidence</span>
        )}
      </span>
    </span>
  );
}

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div className="state-block state-block--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }) {
  return (
    <div className="state-block state-block--error" role="alert">
      <p>{message || "We couldn't update your career analysis right now."}</p>
      {onRetry && (
        <button className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function InsufficientEvidenceBlock({ title = 'Not enough evidence yet', body }) {
  return (
    <div className="state-block state-block--empty">
      <h3>{title}</h3>
      <p>
        {body ||
          'ACEAPT needs more evidence before identifying a reliable read here. Complete an assessment, practice set, or simulation to build this out.'}
      </p>
    </div>
  );
}
