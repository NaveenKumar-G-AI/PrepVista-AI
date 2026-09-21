import type { MemoryStateName, Trend } from '../types';

const STATE_COLOR: Record<MemoryStateName, string> = {
  NOT_LEARNED: 'var(--color-text-faint)',
  LEARNING: 'var(--color-signal)',
  RECENTLY_LEARNED: 'var(--color-signal)',
  STABLE: 'var(--color-sage)',
  DECAYING: 'var(--color-amber)',
  AT_RISK: 'var(--color-amber)',
  FORGOTTEN: 'var(--color-rose)',
  RECOVERING: 'var(--color-signal)',
  REINFORCED: 'var(--color-sage)',
  MASTERED: 'var(--color-sage)',
};

// Small deterministic PRNG so each skill gets a stable, distinct-looking
// trace across re-renders instead of a random flicker.
function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * A stylized readout of the skill's real trend/risk — not a plot of
 * fabricated individual data points. The slope follows `trend`, the
 * vertical baseline follows `retentionRisk`, and per-point jitter comes
 * from a seed derived from the skill id (purely cosmetic, for a
 * consistent "signal" look rather than a flat line).
 */
export function RetentionTrace({
  skillId,
  memoryState,
  trend,
  retentionRisk,
  width = 108,
  height = 28,
}: {
  skillId: string;
  memoryState: MemoryStateName;
  trend: Trend;
  retentionRisk: number | null;
  width?: number;
  height?: number;
}) {
  const rand = seededRandom(skillId);
  const points = 9;
  const risk = retentionRisk ?? 0.3;
  const baseline = height * (0.35 + risk * 0.35); // higher risk -> trace sits lower

  let slopePerStep = 0;
  if (trend === 'DECLINING') slopePerStep = height * 0.032;
  if (trend === 'IMPROVING') slopePerStep = -height * 0.032;

  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * width;
    let y = baseline + slopePerStep * (i - points / 2);
    if (memoryState === 'RECOVERING') {
      // dip then recover: V-shaped, communicates "mid-intervention"
      const mid = points / 2;
      y = baseline + Math.abs(i - mid) * (height * 0.05) - height * 0.1;
    }
    y += (rand() - 0.5) * height * 0.22;
    y = Math.max(2, Math.min(height - 2, y));
    coords.push([x, y]);
  }

  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const color = STATE_COLOR[memoryState];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r={2.4} fill={color} />
    </svg>
  );
}
