import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ReadinessGap } from '../types';

export default function ReadinessGapPanel() {
  const [gap, setGap] = useState<ReadinessGap | null>(null);

  useEffect(() => {
    api.readinessGap().then(setGap);
  }, []);

  if (!gap) return <div className="h-64 rounded-xl border border-line bg-panel animate-pulse" />;

  const maxContribution = Math.max(1, ...gap.contributors.map((c) => c.contribution));

  return (
    <div className="rounded-xl border border-line bg-panel p-6">
      <div className="flex items-baseline gap-6 flex-wrap">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-slate uppercase">Current</p>
          <p className="font-mono text-3xl font-semibold tabular mt-1">{gap.current}%</p>
        </div>
        <span className="text-slate">→</span>
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-slate uppercase">Target</p>
          <p className="font-mono text-3xl font-semibold tabular mt-1 text-teal">{gap.target}%</p>
        </div>
        <div className="ml-auto text-right">
          <p className="font-mono text-[11px] tracking-[0.2em] text-slate uppercase">Gap</p>
          <p className="font-mono text-3xl font-semibold tabular mt-1 text-amber">{gap.gap}pt</p>
        </div>
      </div>

      <p className="mt-5 text-sm text-ivory/90 leading-relaxed border-t border-line pt-5">{gap.explanation}</p>

      <p className="mt-6 font-mono text-[11px] tracking-[0.2em] text-slate uppercase">Main contributors</p>
      <div className="mt-3 space-y-3">
        {gap.contributors.map((c) => (
          <div key={c.skill_name}>
            <div className="flex justify-between text-sm mb-1">
              <span>{c.skill_name}</span>
              <span className="font-mono text-slate tabular">{c.contribution}pt</span>
            </div>
            <div className="h-2 rounded-full bg-ink/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber transition-all duration-500"
                style={{ width: `${(c.contribution / maxContribution) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {gap.contributors.length === 0 && <p className="text-sm text-slate">No significant contributors — you're close.</p>}
      </div>
    </div>
  );
}
