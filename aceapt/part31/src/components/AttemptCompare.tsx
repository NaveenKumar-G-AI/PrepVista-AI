import type { DimensionScores } from '@/lib/db/schema';

interface Side {
  attemptId: string;
  createdAt: string;
  simulatedReadiness: number;
  dimensions: DimensionScores;
}

const ROWS: { key: keyof DimensionScores; label: string }[] = [
  { key: 'capability', label: 'Capability' },
  { key: 'application', label: 'Application' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'speed', label: 'Speed' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'completion', label: 'Completion' },
  { key: 'decisionQuality', label: 'Decision Quality' },
];

export function AttemptCompare({ a, b }: { a: Side; b: Side }) {
  const dateA = new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const dateB = new Date(b.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left">
          <th className="py-2 font-normal text-text-3">Dimension</th>
          <th className="py-2 text-right font-normal text-text-3">{dateA}</th>
          <th className="py-2 text-right font-normal text-text-3">{dateB}</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-line">
          <td className="py-2 text-text-1">Simulated Readiness</td>
          <td className="py-2 text-right font-data text-text-1">{a.simulatedReadiness}%</td>
          <td className="py-2 text-right font-data text-text-1">{b.simulatedReadiness}%</td>
        </tr>
        {ROWS.map((row) => {
          const va = a.dimensions[row.key];
          const vb = b.dimensions[row.key];
          if (va === null && vb === null) return null;
          const delta = va !== null && vb !== null ? vb - va : null;
          return (
            <tr key={row.key} className="border-b border-line last:border-b-0">
              <td className="py-2 text-text-2">{row.label}</td>
              <td className="py-2 text-right font-data text-text-2">{va ?? '—'}</td>
              <td className="py-2 text-right font-data text-text-1">
                {vb ?? '—'}
                {delta !== null && delta !== 0 && <span className={`ml-2 text-xs ${delta > 0 ? 'text-ready' : 'text-critical'}`}>{delta > 0 ? '+' : ''}{delta}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
