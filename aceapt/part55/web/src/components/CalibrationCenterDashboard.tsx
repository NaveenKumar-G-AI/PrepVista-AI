import type { CalibrationCenterSummary } from '../lib/api.js';

const TILES: Array<{ key: keyof CalibrationCenterSummary; label: string; color: string }> = [
  { key: 'total', label: 'Total questions', color: '#1C2420' },
  { key: 'calibrated', label: 'Calibrated', color: '#3D6B63' },
  { key: 'provisional', label: 'Provisional', color: '#A67C1E' },
  { key: 'insufficient_data', label: 'Insufficient data', color: '#5B655D' },
  { key: 'stale', label: 'Stale', color: '#8C6A3F' },
  { key: 'needs_review', label: 'Needs review', color: '#9C4A3C' },
  { key: 'openAnomalies', label: 'Open anomalies', color: '#9C4A3C' },
];

/**
 * §118, §167: the operational overview. Numbers only — no chart-junk, no
 * decorative gradients. A calibration engine's dashboard should read like
 * an instrument panel: quiet, legible, numbers in mono for alignment.
 */
export function CalibrationCenterDashboard({ summary }: { summary: CalibrationCenterSummary }) {
  return (
    <div className="rounded border border-grid bg-panel">
      <div className="border-b border-grid px-5 py-4">
        <h2 className="font-display text-lg text-ink">Difficulty Calibration Center</h2>
        <p className="text-sm text-ink-soft">Evidence-based item difficulty, by the numbers.</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-grid sm:grid-cols-4">
        {TILES.map((tile) => (
          <div key={tile.key} className="px-5 py-4">
            <div className="font-mono text-2xl font-medium tabular-nums" style={{ color: tile.color }}>
              {summary[tile.key]}
            </div>
            <div className="mt-1 text-xs text-ink-soft">{tile.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
