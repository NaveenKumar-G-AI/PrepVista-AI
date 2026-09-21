import React from 'react';

export type ReadingTone = 'strong' | 'neutral' | 'uncertain' | 'weak';

export function toneForState(state: string): ReadingTone {
  if (state === 'MASTERED' || state === 'PROFICIENT' || state === 'PRACTICED') return 'strong';
  if (state === 'AT_RISK' || state === 'REGRESSING') return 'weak';
  if (state === 'UNCERTAIN') return 'uncertain';
  return 'neutral';
}

const TONE_COLOR: Record<ReadingTone, string> = {
  strong: 'var(--sig-strong)',
  neutral: 'var(--sig-neutral)',
  uncertain: 'var(--sig-uncertain)',
  weak: 'var(--sig-weak)',
};

/**
 * Renders `signal` (0-1) as a marker on a track, bracketed by ticks whose
 * SPREAD is (1 - confidence): a confident reading draws a tight bracket right
 * on the marker; an unconfident one draws a wide bracket, visually saying
 * "somewhere in here" rather than pretending to a precision the evidence
 * doesn't support (req #67 — confidence must read as visually distinct from
 * signal, not as a second identical bar next to the first).
 */
export function SignalTrace({
  signal,
  confidence,
  tone,
  width = 220,
  height = 34,
  label,
}: {
  signal: number;
  confidence: number;
  tone: ReadingTone;
  width?: number;
  height?: number;
  label?: string;
}) {
  const trackY = height / 2;
  const trackX0 = 6;
  const trackX1 = width - 6;
  const trackW = trackX1 - trackX0;
  const markerX = trackX0 + signal * trackW;
  const halfSpread = (1 - confidence) * (trackW * 0.28); // max ~28% of track width at zero confidence
  const bracketLeft = Math.max(trackX0, markerX - halfSpread);
  const bracketRight = Math.min(trackX1, markerX + halfSpread);
  const color = TONE_COLOR[tone];
  const tickH = 8;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? `signal ${(signal * 100).toFixed(0)}%, confidence ${(confidence * 100).toFixed(0)}%`}>
      <line x1={trackX0} y1={trackY} x2={trackX1} y2={trackY} stroke="var(--sig-line)" strokeWidth={1.5} />
      <line x1={trackX0} y1={trackY} x2={markerX} y2={trackY} stroke={color} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />

      {/* confidence bracket — the signature device */}
      <line x1={bracketLeft} y1={trackY - tickH / 2} x2={bracketLeft} y2={trackY + tickH / 2} stroke={color} strokeWidth={1.5} opacity={0.55} />
      <line x1={bracketRight} y1={trackY - tickH / 2} x2={bracketRight} y2={trackY + tickH / 2} stroke={color} strokeWidth={1.5} opacity={0.55} />
      <line x1={bracketLeft} y1={trackY} x2={bracketRight} y2={trackY} stroke={color} strokeWidth={1} strokeDasharray="1 2.5" opacity={0.45} />

      {/* reading marker */}
      <circle cx={markerX} cy={trackY} r={4} fill="var(--sig-paper)" stroke={color} strokeWidth={2.5} />
    </svg>
  );
}
