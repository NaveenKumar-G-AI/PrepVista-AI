import type { ReadinessState } from '../api/types';

/**
 * A single readiness spectrum (coral -> amber -> teal) drives both the gauge
 * and every dimension bar, so a color always means the same thing everywhere
 * in the report: where a number sits between "not ready" and "highly ready".
 */
export function colorForScore(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped < 50) {
    const t = clamped / 50;
    return mix('#c8493c', '#e2a23d', t);
  }
  const t = (clamped - 50) / 50;
  return mix('#e2a23d', '#2f9e8b', t);
}

function mix(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = hex.replace('#', '');
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

export const READINESS_STATE_LABEL: Record<ReadinessState, string> = {
  NOT_READY: 'Not Ready',
  FOUNDATION: 'Foundation',
  DEVELOPING: 'Developing',
  APPROACHING_READY: 'Approaching Ready',
  READY: 'Ready',
  HIGHLY_READY: 'Highly Ready',
};

export const READINESS_BAND_THRESHOLDS = [40, 55, 65, 75, 85];
