import { useState } from 'react';
import type { ShortcutDetail, ValidateResult } from '../types';
import { StatusDot } from './StatusDot';
import type { DevIdentity } from '../api/client';
import { api } from '../api/client';

function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatMs(ms: number | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function ShortcutDetailPanel({
  shortcut,
  identity,
  onClose,
  onChanged,
}: {
  shortcut: ShortcutDetail;
  identity: DevIdentity;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ValidateResult | null>(null);
  const [pending, setPending] = useState(false);

  async function runTest() {
    setTesting(true);
    try {
      const result = await api.post<ValidateResult>(`/api/shortcuts/${shortcut.shortcutId}/test`, identity);
      setTestResult(result);
      onChanged();
    } finally {
      setTesting(false);
    }
  }

  async function togglePin() {
    setPending(true);
    try {
      await api.patch(`/api/shortcuts/${shortcut.shortcutId}/preference`, identity, { pinned: !shortcut.pinned });
      onChanged();
    } finally {
      setPending(false);
    }
  }

  const perf = shortcut.performance;

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-ink/20" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-line bg-paper p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl text-ink">{shortcut.canonicalName}</h2>
            <div className="mt-1.5 flex items-center gap-3 text-sm text-inksoft">
              <StatusDot state={shortcut.trustState} />
              <span aria-hidden>·</span>
              <span>content status: {shortcut.status.toLowerCase()}</span>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-inksoft hover:text-ink" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {shortcut.description && <p className="mt-5 text-[15px] leading-relaxed text-ink">{shortcut.description}</p>}

        {shortcut.steps.length > 0 && (
          <Section title="How it works">
            <ol className="list-decimal space-y-1.5 pl-5 text-[15px] text-ink">
              {shortcut.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </Section>
        )}

        {shortcut.underlyingReason && (
          <Section title="Why it works">
            <p className="text-[15px] leading-relaxed text-ink">{shortcut.underlyingReason}</p>
          </Section>
        )}

        {(shortcut.conditions.length > 0 || shortcut.whenToUseText) && (
          <Section title="When to use it" tone="verified">
            {shortcut.conditions.map((c, i) => (
              <p key={i} className="text-[15px] text-ink">
                {c.label ?? `${c.field} ${c.op} ${JSON.stringify(c.value)}`}
              </p>
            ))}
            {shortcut.whenToUseText && <p className="text-[15px] text-ink">{shortcut.whenToUseText}</p>}
          </Section>
        )}

        {(shortcut.nonApplicability.length > 0 || shortcut.whenNotToUseText) && (
          <Section title="When not to use it" tone="caution">
            {shortcut.nonApplicability.map((c, i) => (
              <p key={i} className="text-[15px] text-ink">
                {c.label ?? `${c.field} ${c.op} ${JSON.stringify(c.value)}`}
              </p>
            ))}
            {shortcut.whenNotToUseText && <p className="text-[15px] text-ink">{shortcut.whenNotToUseText}</p>}
          </Section>
        )}

        {shortcut.expression && (
          <Section title="Formula">
            <p className="font-mono text-sm text-ink">
              {shortcut.expression}
              {shortcut.canonicalExpression && <span className="text-inksoft"> &nbsp;≡&nbsp; {shortcut.canonicalExpression}</span>}
            </p>
          </Section>
        )}

        {perf && perf.usageCount > 0 && (
          <Section title="Your performance">
            <div className="grid grid-cols-3 gap-4 font-mono tabular">
              <Stat label="Accuracy" value={formatPercent(perf.reliability)} />
              <Stat label="Typical time" value={formatMs(perf.medianResponseTimeMs)} />
              <Stat label="Standard method" value={formatMs(perf.medianBaselineTimeMs)} />
            </div>
            <p className="mt-2 text-sm text-inksoft">
              Based on {perf.usageCount} use{perf.usageCount === 1 ? '' : 's'}
              {perf.avgTimeSavedRatio != null && perf.avgTimeSavedRatio > 0 && (
                <> · saves you roughly {formatPercent(perf.avgTimeSavedRatio)} of the time, on average</>
              )}
              .
            </p>
          </Section>
        )}

        {shortcut.latestValidation && (
          <Section title="Validation">
            <p className="text-[15px] text-ink">
              Last checked {shortcut.latestValidation.validationType.toLowerCase().replace(/_/g, ' ')}:{' '}
              <span className={shortcut.latestValidation.status === 'PASS' ? 'text-verified' : 'text-caution'}>
                {shortcut.latestValidation.status}
              </span>
            </p>
          </Section>
        )}

        {testResult && (
          <Section title="Test result">
            <p className="text-[15px] text-ink">
              Overall:{' '}
              <span className={testResult.overallStatus === 'PASS' ? 'text-verified' : 'text-caution'}>{testResult.overallStatus}</span>
            </p>
            {testResult.propertyTest && (
              <p className="mt-1 text-sm text-inksoft">
                Checked {testResult.propertyTest.samplesTested} cases against the standard formula
                {testResult.propertyTest.failures.length > 0 && `, ${testResult.propertyTest.failures.length} disagreed`}.
              </p>
            )}
          </Section>
        )}

        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
          <button
            onClick={runTest}
            disabled={testing}
            className="rounded-full bg-ink px-5 py-2 text-sm text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {testing ? 'Testing…' : 'Test this shortcut'}
          </button>
          <button
            onClick={togglePin}
            disabled={pending}
            className="rounded-full border border-line px-5 py-2 text-sm text-ink transition-colors hover:bg-surface disabled:opacity-50"
          >
            {shortcut.pinned ? 'Unpin' : 'Pin as preferred'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg text-ink">{value}</div>
      <div className="text-xs text-inksoft">{label}</div>
    </div>
  );
}

function Section({ title, tone, children }: { title: string; tone?: 'verified' | 'caution'; children: React.ReactNode }) {
  const barColor = tone === 'verified' ? 'bg-verified' : tone === 'caution' ? 'bg-caution' : 'bg-line';
  return (
    <div className="mt-6 flex gap-3">
      <div className={`mt-1 w-0.5 shrink-0 self-stretch rounded-full ${barColor}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <h3 className="mb-1.5 font-display text-base text-ink">{title}</h3>
        <div className="space-y-1">{children}</div>
      </div>
    </div>
  );
}
