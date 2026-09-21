import { useEffect, useState } from 'react';
import type { ReadinessConfidence, ReadinessState } from '../api/types';
import { colorForScore, READINESS_BAND_THRESHOLDS, READINESS_STATE_LABEL } from './spectrum';

export function ReadinessGauge({
  score,
  state,
  confidence,
}: {
  score: number;
  state: ReadinessState;
  confidence: ReadinessConfidence;
}) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimatedScore(score));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  const color = colorForScore(score);

  return (
    <div className="stack-sm" style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span
          className="data-num"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', fontWeight: 600, lineHeight: 1, color }}
        >
          {Math.round(animatedScore)}
          <span style={{ fontSize: '0.4em', fontFamily: 'var(--font-body)', fontWeight: 500, marginLeft: 4 }}>%</span>
        </span>
        <span
          className="badge"
          style={{ background: `${color}1a`, color, border: `1px solid ${color}55` }}
        >
          {READINESS_STATE_LABEL[state]}
        </span>
      </div>

      <div
        aria-hidden
        style={{
          position: 'relative',
          height: 10,
          borderRadius: 999,
          marginTop: 'var(--space-4)',
          background: 'linear-gradient(90deg, #c8493c 0%, #e2a23d 50%, #2f9e8b 100%)',
          opacity: 0.9,
        }}
      >
        {READINESS_BAND_THRESHOLDS.map((t) => (
          <div
            key={t}
            style={{
              position: 'absolute',
              left: `${t}%`,
              top: -3,
              bottom: -3,
              width: 1,
              background: 'rgba(245, 242, 234, 0.55)',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: `${animatedScore}%`,
            top: -6,
            width: 3,
            height: 22,
            borderRadius: 2,
            background: 'var(--bone-text)',
            transform: 'translateX(-50%)',
            transition: 'left 900ms var(--ease-standard)',
            boxShadow: '0 0 0 3px var(--bone-raised)',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="eyebrow">Not Ready</span>
        <span className="eyebrow">Highly Ready</span>
      </div>
      <p style={{ color: 'var(--bone-text-muted)', fontSize: 'var(--text-sm)' }}>
        Evidence confidence: <strong style={{ color: 'var(--bone-text)' }}>{confidence}</strong>
      </p>
    </div>
  );
}
