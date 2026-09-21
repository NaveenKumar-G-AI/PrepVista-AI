import { HistoryItem, DISPLAY_NAME } from '../types';
import { EffectivenessBadge } from './CalibrationMeter';

export function InterventionHistoryList({ history }: { history: HistoryItem[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-muted">No interventions completed yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {history.map(({ execution, outcome }) => (
        <li key={execution.id} className="flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3">
          <div>
            <div className="font-display text-sm font-semibold text-ink">{DISPLAY_NAME[execution.type] ?? execution.type}</div>
            <div className="font-mono text-xs text-muted">
              {execution.contract.topic}
              {execution.completedAt ? ` · ${new Date(execution.completedAt).toLocaleDateString()}` : ''}
            </div>
          </div>
          {outcome ? (
            <EffectivenessBadge label={outcome.immediateEffectiveness} />
          ) : (
            <span className="font-mono text-xs text-muted">{execution.status.toLowerCase()}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
