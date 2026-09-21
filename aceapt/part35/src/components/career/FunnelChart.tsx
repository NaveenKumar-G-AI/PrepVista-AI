import type { FunnelResult } from '@/lib/types';
import { PatternStrengthTag } from '../ui/Tags';

export function FunnelChart({ funnel, compact = false }: { funnel: FunnelResult; compact?: boolean }) {
  const maxCount = Math.max(1, ...funnel.stages.map((s) => s.count));

  return (
    <div aria-label="Career conversion funnel by stage" className="space-y-0">
      {funnel.stages.map((stage, i) => {
        const widthPct = Math.round((stage.count / maxCount) * 100);
        const isBottleneckTo = funnel.bottleneck?.toStage === stage.stageKey;
        return (
          <div
            key={stage.stageKey}
            className={`flex items-center gap-4 border-t border-line py-3 first:border-t-0 ${
              isBottleneckTo ? 'border-l-2 border-l-clay pl-3 -ml-3' : ''
            }`}
          >
            <div className="w-32 shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              {stage.label}
            </div>
            <div className="flex-1">
              <div className="h-2 w-full rounded-full bg-paper overflow-hidden">
                <div
                  className="h-full rounded-full bg-pine animate-grow-w"
                  style={{ ['--target-w' as string]: `${widthPct}%`, width: `${widthPct}%` }}
                />
              </div>
            </div>
            <div className="w-14 shrink-0 text-right font-display text-lg text-ink tabular-nums">
              {stage.count}
            </div>
            {!compact && (
              <div className="w-24 shrink-0 text-right">
                {stage.conversionFromPrevious !== null ? (
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {Math.round(stage.conversionFromPrevious * 100)}%
                  </span>
                ) : (
                  <span className="font-mono text-xs text-muted">—</span>
                )}
              </div>
            )}
            {!compact && isBottleneckTo && i > 0 && (
              <div className="shrink-0">
                <PatternStrengthTag strength={funnel.bottleneck!.confidence} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
