import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { api } from '../api/client';
import type { Milestone } from '../types';

const STATUS_ICON = { COMPLETE: CheckCircle2, IN_PROGRESS: CircleDot, PENDING: Circle } as const;
const STATUS_COLOR = { COMPLETE: 'text-teal', IN_PROGRESS: 'text-amber', PENDING: 'text-slate' } as const;

export default function MilestonesPanel() {
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);

  useEffect(() => {
    api.milestones().then((res) => setMilestones(res.milestones));
  }, []);

  if (!milestones) return <div className="h-64 rounded-xl border border-line bg-panel animate-pulse" />;

  return (
    <div className="rounded-xl border border-line bg-panel p-6">
      <p className="font-mono text-[11px] tracking-[0.2em] text-slate uppercase mb-5">Milestones</p>
      <ol className="space-y-5">
        {milestones.map((m) => {
          const Icon = STATUS_ICON[m.status];
          const pct = Math.min(100, (m.progress / m.target) * 100);
          return (
            <li key={m.id} className="flex gap-4">
              <Icon size={20} className={`mt-0.5 shrink-0 ${STATUS_COLOR[m.status]}`} />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-sm font-medium ${m.status === 'COMPLETE' ? 'text-slate line-through' : ''}`}>
                    {m.objective}
                  </span>
                  <span className="font-mono text-xs tabular text-slate shrink-0">
                    {m.progress} / {m.target}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-ink/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      m.status === 'COMPLETE' ? 'bg-teal' : 'bg-amber'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
