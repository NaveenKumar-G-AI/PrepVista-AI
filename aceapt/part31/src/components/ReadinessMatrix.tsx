import { ProgressBar } from './ui';
import type { DimensionScores } from '@/lib/db/schema';

const ROWS: { key: keyof DimensionScores; label: string }[] = [
  { key: 'capability', label: 'Capability' },
  { key: 'application', label: 'Application' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'speed', label: 'Speed' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'completion', label: 'Completion' },
  { key: 'decisionQuality', label: 'Decision Quality' },
];

function colorFor(value: number) {
  if (value >= 80) return 'bg-ready';
  if (value >= 55) return 'bg-caution';
  return 'bg-critical';
}

export function ReadinessMatrix({ dimensions }: { dimensions: DimensionScores }) {
  return (
    <div className="flex flex-col gap-3">
      {ROWS.map((row) => {
        const value = dimensions[row.key];
        if (value === null || value === undefined) return null;
        return (
          <div key={row.key} className="grid grid-cols-[110px_1fr_40px] items-center gap-3">
            <span className="text-sm text-text-2">{row.label}</span>
            <ProgressBar value={value} colorClass={colorFor(value)} />
            <span className="font-data text-right text-sm text-text-1">{value}%</span>
          </div>
        );
      })}
    </div>
  );
}
