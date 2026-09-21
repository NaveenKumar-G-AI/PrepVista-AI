import React from 'react';
import { SourceMetaLine } from './shared/Badges';

export function MarketMovement({ market }: { market: any }) {
  if (!market.signals?.length) {
    return <p className="font-serif text-[15px] text-inksoft/60">Current market evidence is insufficient for a reliable analysis yet.</p>;
  }
  return (
    <div className="space-y-5">
      {market.changedSincePriorPeriod?.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-mono text-[11px] uppercase tracking-wide text-inksoft/50">What changed</p>
          <ul className="mt-2 space-y-1.5">
            {market.changedSincePriorPeriod.slice(0, 6).map((c: string) => (
              <li key={c} className="font-serif text-[14px] text-inksoft">{c}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {market.signals.slice(0, 6).map((s: any) => (
          <div key={s.id} className="rounded-xl border border-line bg-surface p-4">
            <p className="font-display text-[15px] text-ink">{s.targetLabel}</p>
            <p className="mt-1 font-serif text-[13px] leading-snug text-inksoft/80">{s.interpretation}</p>
            <SourceMetaLine meta={s.meta} />
          </div>
        ))}
      </div>
    </div>
  );
}

const THEN_NOW_LABEL = ['Then', 'Now', 'Emerging'];

export function RoleEvolutionPanel({ evolution }: { evolution: any }) {
  if (!evolution) return <p className="font-serif text-[15px] text-inksoft/60">Not enough historical data yet to characterize how this role is changing.</p>;
  const columns = [evolution.then, evolution.now, evolution.emerging];
  return (
    <div>
      {evolution.narrative && <p className="font-serif text-[16px] leading-relaxed text-ink">{evolution.narrative}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {columns.map((text, i) => (
          <div key={THEN_NOW_LABEL[i]} className="rounded-xl border border-line bg-surface p-4">
            <p className="font-mono text-[11px] uppercase tracking-wide text-inksoft/50">{THEN_NOW_LABEL[i]}</p>
            <p className="mt-1.5 font-serif text-[14px] leading-relaxed text-inksoft">{text}</p>
          </div>
        ))}
      </div>
      {(evolution.aiImpact?.aiAssistedTasks?.length > 0 || evolution.aiImpact?.humanCriticalTasks?.length > 0) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-signal-rust/80">AI-assisted tasks</p>
            <p className="mt-1 font-serif text-[14px] text-inksoft">{evolution.aiImpact.aiAssistedTasks.join(', ') || 'None identified'}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-signal-teal/80">Human-critical tasks</p>
            <p className="mt-1 font-serif text-[14px] text-inksoft">{evolution.aiImpact.humanCriticalTasks.join(', ') || 'None identified'}</p>
          </div>
        </div>
      )}
      <SourceMetaLine meta={evolution.meta} />
    </div>
  );
}
