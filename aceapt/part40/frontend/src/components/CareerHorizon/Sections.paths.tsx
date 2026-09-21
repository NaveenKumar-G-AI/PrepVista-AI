import React from 'react';
import { TrendTag } from './shared/Badges';

const CATEGORY_LABEL: Record<string, string> = {
  PRIMARY: 'Primary', SPECIALIST: 'Specialist', ADJACENT: 'Adjacent', EMERGING: 'Emerging', EXPLORATORY: 'Exploratory',
};

export function CareerPaths({ branches }: { branches: any[] }) {
  if (!branches.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {branches.map((b) => (
        <div key={b.roleId} className={`rounded-2xl border p-5 ${b.category === 'PRIMARY' ? 'border-signal-teal/40 bg-signal-teal/[0.05]' : 'border-line bg-surface'}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-wide text-inksoft/50">{CATEGORY_LABEL[b.category]}</p>
            <TrendTag classification={b.marketDirection} />
          </div>
          <p className="mt-1 font-display text-lg text-ink">{b.roleTitle}</p>
          <p className="mt-2 font-serif text-[13px] leading-relaxed text-inksoft/80">{b.whyItFits}</p>
          {b.gaps?.length > 0 && (
            <p className="mt-2 font-mono text-[11px] text-inksoft/50">gaps: {b.gaps.slice(0, 3).join(', ')}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function DiscoveryDirections({ directions }: { directions: any[] }) {
  if (!directions?.length) {
    return <p className="font-serif text-[15px] text-inksoft/60">Add some evidence -- projects, assessments, or verified work -- and we'll suggest directions worth exploring.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {directions.map((d) => (
        <div key={d.roleId} className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-display text-lg text-ink">{d.roleTitle}</p>
          <p className="mt-2 font-serif text-[13px] leading-relaxed text-inksoft/80">{d.whyItFits}</p>
        </div>
      ))}
    </div>
  );
}
