import React from 'react';
import { SeverityTag, SourceMetaLine } from './shared/Badges';

export function FutureGaps({ gaps }: { gaps: any[] }) {
  if (!gaps.length) return <p className="font-serif text-[15px] text-inksoft/60">No meaningful gaps detected against your current evidence -- nice work staying current.</p>;
  return (
    <div className="space-y-4">
      {gaps.map((g) => (
        <div key={g.id} className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-lg text-ink">{g.skillName}</p>
            <SeverityTag severity={g.severity} />
          </div>
          <p className="mt-2 font-serif text-[14px] leading-relaxed text-inksoft/90">{g.explanation}</p>
          <p className="mt-2 font-serif text-[13px] leading-relaxed text-signal-teal">&rarr; {g.recommendedAction}</p>
          <SourceMetaLine meta={g.meta} />
        </div>
      ))}
    </div>
  );
}

const TIER_LABEL: Record<string, string> = {
  HIGH_VALUE: 'High value', MEDIUM_VALUE: 'Medium value', LOW_PRIORITY: 'Low priority', NOT_A_PRIORITY_RIGHT_NOW: 'Not a priority right now',
};

export function StrategicPriorities({ priorities }: { priorities: any }) {
  return (
    <div className="space-y-6">
      {priorities.focusModeActive && (
        <div className="rounded-xl border border-signal-amber/40 bg-signal-amber/[0.06] p-4">
          <p className="font-mono text-[11px] uppercase tracking-wide text-signal-amber">Focus mode</p>
          <p className="mt-1 font-serif text-[14px] text-inksoft">{priorities.focusModeMessage}</p>
        </div>
      )}
      {priorities.learning?.length > 0 && (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-inksoft/50">Learning priorities</p>
          <div className="mt-2 space-y-2">
            {priorities.learning.slice(0, 5).map((l: any, i: number) => (
              <div key={i} className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-4">
                <div>
                  <p className="font-display text-[15px] text-ink">{l.skillName}</p>
                  <p className="mt-1 font-serif text-[13px] text-inksoft/80">{l.nextAction}</p>
                </div>
                <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-wide text-signal-amber">{TIER_LABEL[l.tier]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {priorities.projects?.length > 0 && (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-inksoft/50">Project recommendations</p>
          <div className="mt-2 space-y-2">
            {priorities.projects.map((p: any, i: number) => (
              <div key={i} className="rounded-xl border border-line bg-surface p-4">
                <p className="font-display text-[15px] text-ink">{p.title}</p>
                <p className="mt-1 font-serif text-[13px] leading-relaxed text-inksoft/80">{p.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
