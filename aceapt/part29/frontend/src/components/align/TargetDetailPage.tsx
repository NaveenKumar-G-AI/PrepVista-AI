import React from 'react';
import { AlignmentResult, AlignmentSnapshot, CapabilityLevel, WhatIfResult } from '../../types/align.types';
import { MonoStat, StateBadge } from './shared';
import { WhyPanel } from './WhyPanel';
import { CapabilityMatchTable } from './CapabilityMatchTable';
import { GapFlow } from './GapFlow';
import { WhatIfSimulator } from './WhatIfSimulator';
import { AlignmentHistoryChart } from './AlignmentHistoryChart';
import { InsufficientEvidenceState } from './InsufficientEvidenceState';

export function TargetDetailPage({
  result,
  explanation,
  history,
  onImproveGap,
  onProveTarget,
  onRunScenario,
}: {
  result: AlignmentResult;
  explanation: string;
  history: AlignmentSnapshot[];
  onImproveGap: (capabilityId: string) => void;
  onProveTarget: () => void;
  onRunScenario: (capabilityId: string, projectedLevel: CapabilityLevel) => Promise<WhatIfResult>;
}) {
  if (result.state === 'INSUFFICIENT_EVIDENCE') {
    return <InsufficientEvidenceState reason={result.insufficientEvidenceReason} targetName={result.targetName} />;
  }

  const gapCapabilities = [...result.criticalGaps, ...result.supportingGaps].map((g) => ({
    id: g.capabilityId,
    name: g.capabilityName,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-align-text-primary">{result.targetName}</h1>
          <div className="mt-1">
            <StateBadge state={result.state} />
          </div>
        </div>
        <div className="flex gap-8">
          <MonoStat label="Fit" value={result.fitScore} tone="fit" />
          <MonoStat label="Readiness" value={result.readinessScore} tone="readiness" />
        </div>
      </div>

      <WhyPanel result={result} explanation={explanation} />
      <CapabilityMatchTable result={result} />
      <GapFlow result={result} onImprove={onImproveGap} onProve={onProveTarget} />

      {gapCapabilities.length > 0 && <WhatIfSimulator capabilityOptions={gapCapabilities} onRunScenario={onRunScenario} />}

      <div className="rounded-lg border border-align-border bg-align-surface p-5">
        <h3 className="font-display text-base font-semibold text-align-text-primary">Alignment history</h3>
        <div className="mt-3">
          <AlignmentHistoryChart snapshots={history} />
        </div>
      </div>
    </div>
  );
}
