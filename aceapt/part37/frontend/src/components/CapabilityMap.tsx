import { useState } from 'react';
import type { CapabilityStatus, RequiredLevel } from '../types';
import { EvidenceDetailModal } from './EvidenceDetailModal';
import { EvidenceLadder } from './EvidenceLadder';
import { StatusPill, capabilityLabelTone } from './shared';

const REQUIRED_LEVEL_LABEL: Record<RequiredLevel, string> = { BASIC: 'Basic', INTERMEDIATE: 'Intermediate', STRONG: 'Strong' };

function labelText(label: CapabilityStatus['label']): string {
  return label === 'UNKNOWN' ? 'Unknown' : label.charAt(0) + label.slice(1).toLowerCase();
}

/**
 * Screen 3 from the brief. Every row already carries its own explanation
 * (`reasons`, `hasConflict`, freshness) from the single readiness payload —
 * clicking a row opens the detail drawer, which lazily fetches the raw,
 * per-item evidence only when actually needed (see EvidenceDetailModal).
 */
export function CapabilityMap({ studentId, roleId, statuses }: { studentId: string; roleId: string; statuses: CapabilityStatus[] }) {
  const [selected, setSelected] = useState<CapabilityStatus | null>(null);

  return (
    <section className="rounded-card border border-paper-line bg-white/70 p-6 sm:p-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Capability map</h2>
        <p className="shrink-0 font-mono text-xs text-ink/45">{statuses.length} tracked</p>
      </div>

      <ul className="mt-5 divide-y divide-paper-line">
        {statuses.map((s) => (
          <li key={s.capabilityId}>
            <button
              type="button"
              onClick={() => setSelected(s)}
              className="flex w-full flex-col gap-2.5 py-4 text-left transition-colors hover:bg-paper-dim/40 focus-visible:bg-paper-dim/40 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="min-w-0 truncate font-medium text-ink">{s.capabilityName}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink/45">requires {REQUIRED_LEVEL_LABEL[s.requiredLevel]}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <EvidenceLadder achievedClass={s.achievedClass} hasConflict={s.hasConflict} compact />
                <StatusPill tone={capabilityLabelTone(s.label)}>{labelText(s.label)}</StatusPill>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selected && <EvidenceDetailModal studentId={studentId} roleId={roleId} status={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
