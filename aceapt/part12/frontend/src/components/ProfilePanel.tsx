import { InterventionProfile, DISPLAY_NAME } from '../types';
import { CalibrationMeter } from './CalibrationMeter';

const POSITION: Record<string, number> = {
  HIGH: 0.95,
  MEDIUM_HIGH: 0.7,
  MEDIUM: 0.45,
  LOW: 0.2,
  INSUFFICIENT_DATA: 0.05
};

export function ProfilePanel({ profile }: { profile: InterventionProfile | null }) {
  if (!profile || profile.entries.length === 0) {
    return <p className="text-sm text-muted">No response data yet — this builds up as interventions are completed.</p>;
  }

  return (
    <div className="space-y-4">
      {profile.entries.map(entry => (
        <div key={entry.type}>
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-medium text-ink">{DISPLAY_NAME[entry.type] ?? entry.type}</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
              {entry.responseLabel.replaceAll('_', ' ').toLowerCase()}
            </span>
          </div>
          <div className="mt-1.5">
            <CalibrationMeter value={POSITION[entry.responseLabel] ?? 0} size="sm" />
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted">
            {entry.attempts} attempt{entry.attempts === 1 ? '' : 's'}
            {entry.nonResponseFlag ? ' · non-response flagged' : ''}
            {entry.saturationFlag ? ' · saturation flagged' : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
