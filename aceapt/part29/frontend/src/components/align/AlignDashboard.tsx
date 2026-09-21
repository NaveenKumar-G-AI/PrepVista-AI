import React from 'react';
import { AlignmentResult, TargetPriorityEntry } from '../../types/align.types';
import { AlignHero } from './AlignHero';
import { FitReadinessScope, ScopePoint } from './FitReadinessScope';
import { TargetPriorityList } from './TargetPriorityList';

export function AlignDashboard({
  results,
  shortlist,
  awaitingEvidence,
  onViewTarget,
  onImproveGap,
  onProveTarget,
}: {
  results: AlignmentResult[];
  shortlist: TargetPriorityEntry[];
  awaitingEvidence: { targetId: string; targetName: string }[];
  onViewTarget: (targetId: string) => void;
  onImproveGap: (targetId: string) => void;
  onProveTarget: (targetId: string) => void;
}) {
  const primary = results.find((r) => r.targetId === shortlist[0]?.targetId) ?? null;

  const scopePoints: ScopePoint[] = results
    .filter((r): r is AlignmentResult & { fitScore: number; readinessScore: number } => r.fitScore !== null && r.readinessScore !== null)
    .map((r) => ({
      targetId: r.targetId,
      targetName: r.targetName,
      fitScore: r.fitScore,
      readinessScore: r.readinessScore,
      state: r.state,
    }));

  return (
    <div className="space-y-6">
      {primary && (
        <AlignHero
          primary={primary}
          onViewWhy={() => onViewTarget(primary.targetId)}
          onImproveGap={() => onImproveGap(primary.targetId)}
          onProveTarget={() => onProveTarget(primary.targetId)}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
        <div className="rounded-xl border border-align-border bg-align-surface p-5">
          <h2 className="font-display text-base font-semibold text-align-text-primary">Fit &times; Readiness</h2>
          <div className="mt-3">
            <FitReadinessScope points={scopePoints} highlightedTargetId={primary?.targetId} />
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display text-base font-semibold text-align-text-primary">Your targets</h2>
          <TargetPriorityList shortlist={shortlist} awaitingEvidence={awaitingEvidence} onView={onViewTarget} />
        </div>
      </div>
    </div>
  );
}
