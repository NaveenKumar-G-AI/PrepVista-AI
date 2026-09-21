'use client';

import { useState } from 'react';
import { VerdictBadge } from './ui';
import type { StageEvaluation } from '@/lib/db/schema';

const DOT_COLOR: Record<string, string> = { strong: 'bg-ready', weak: 'bg-caution', critical: 'bg-critical', not_reached: 'bg-text-3' };

export function FailurePointTimeline({ stages }: { stages: StageEvaluation[] }) {
  const [openId, setOpenId] = useState<string | null>(stages.find((s) => s.verdict === 'critical' || s.verdict === 'weak')?.stageId ?? null);

  return (
    <div>
      <div className="flex items-center gap-1.5">
        {stages.map((s, i) => (
          <div key={s.stageId} className="flex flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOpenId(openId === s.stageId ? null : s.stageId)}
              aria-expanded={openId === s.stageId}
              className={`h-2.5 w-full rounded-full transition-opacity ${DOT_COLOR[s.verdict]} ${openId === s.stageId ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
              title={`${s.title} — ${s.verdict}`}
            />
            {i < stages.length - 1 && <span className="text-text-3">›</span>}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {stages.map((s) => (
          <div key={s.stageId} className={`rounded-lg border ${openId === s.stageId ? 'border-line bg-raised/40' : 'border-transparent'}`}>
            <button type="button" onClick={() => setOpenId(openId === s.stageId ? null : s.stageId)} className="flex w-full items-center justify-between px-3 py-2 text-left">
              <span className="text-sm text-text-1">{s.title}</span>
              <VerdictBadge verdict={s.verdict} />
            </button>
            {openId === s.stageId && (
              <div className="grid grid-cols-3 gap-3 px-3 pb-3 text-center">
                <div>
                  <div className="font-data text-lg text-text-1">{s.accuracy}%</div>
                  <div className="eyebrow mt-1">Accuracy</div>
                </div>
                <div>
                  <div className="font-data text-lg text-text-1">
                    {s.itemsAttempted}/{s.itemsTotal}
                  </div>
                  <div className="eyebrow mt-1">Attempted</div>
                </div>
                <div>
                  <div className="font-data text-lg text-text-1">{s.avgTimeSeconds > 0 ? `${s.avgTimeSeconds}s` : '—'}</div>
                  <div className="eyebrow mt-1">Avg time / item</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
