import React, { useState } from 'react';
import { CapabilityLevel, WhatIfResult } from '../../types/align.types';
import { MonoStat } from './shared';

const LEVEL_OPTIONS: CapabilityLevel[] = ['DEVELOPING', 'MEDIUM', 'STRONG', 'VERY_STRONG'];

export function WhatIfSimulator({
  capabilityOptions,
  onRunScenario,
}: {
  capabilityOptions: { id: string; name: string }[];
  onRunScenario: (capabilityId: string, projectedLevel: CapabilityLevel) => Promise<WhatIfResult>;
}) {
  const [capabilityId, setCapabilityId] = useState(capabilityOptions[0]?.id ?? '');
  const [projectedLevel, setProjectedLevel] = useState<CapabilityLevel>('STRONG');
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!capabilityId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await onRunScenario(capabilityId, projectedLevel);
      setResult(r);
    } catch {
      setError('Could not run that projection right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-align-border bg-align-surface p-5">
      <h3 className="font-display text-base font-semibold text-align-text-primary">What if you improve?</h3>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-body text-xs uppercase tracking-wider text-align-text-tertiary">Capability</span>
          <select
            value={capabilityId}
            onChange={(e) => setCapabilityId(e.target.value)}
            className="rounded-md border border-align-border-strong bg-align-surface-raised px-2.5 py-1.5 font-body text-sm text-align-text-primary"
          >
            {capabilityOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-body text-xs uppercase tracking-wider text-align-text-tertiary">Projected level</span>
          <select
            value={projectedLevel}
            onChange={(e) => setProjectedLevel(e.target.value as CapabilityLevel)}
            className="rounded-md border border-align-border-strong bg-align-surface-raised px-2.5 py-1.5 font-body text-sm text-align-text-primary"
          >
            {LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {level.replaceAll('_', ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={run}
          disabled={loading || !capabilityId}
          className="rounded-md bg-align-fit-dim px-4 py-2 font-body text-sm font-medium text-align-text-primary transition-colors hover:bg-align-fit disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Calculating\u2026' : 'Run projection'}
        </button>
      </div>

      {error && <p className="mt-3 font-body text-sm text-align-critical">{error}</p>}

      {result && (
        <div className="mt-5 border-t border-align-border pt-4">
          <span className="inline-block rounded border border-align-border-strong px-2 py-0.5 font-body text-[11px] uppercase tracking-wider text-align-text-tertiary">
            Projected — not actual
          </span>

          {result.projectionReliable ? (
            <div className="mt-3 flex flex-wrap gap-8">
              <ProjectionStat label="Fit" tone="fit" current={result.currentFitScore} projected={result.projectedFitScore} />
              <ProjectionStat
                label="Readiness"
                tone="readiness"
                current={result.currentReadinessScore}
                projected={result.projectedReadinessScore}
              />
            </div>
          ) : (
            <p className="mt-3 font-body text-sm text-align-text-secondary">
              Improvement may strengthen alignment, but there isn&rsquo;t enough evidence yet on this capability for a
              reliable numerical projection.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectionStat({
  label,
  tone,
  current,
  projected,
}: {
  label: string;
  tone: 'fit' | 'readiness';
  current: number | null;
  projected: number | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <MonoStat label={`${label} now`} value={current} tone={tone} />
      <span className="translate-y-3 text-align-text-tertiary" aria-hidden="true">
        &#8594;
      </span>
      <MonoStat label={`${label} projected`} value={projected} tone={tone} />
    </div>
  );
}
