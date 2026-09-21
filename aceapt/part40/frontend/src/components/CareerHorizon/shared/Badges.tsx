import React from 'react';

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-signal-rust border-signal-rust/40 bg-signal-rust/[0.06]',
  HIGH: 'text-signal-amber border-signal-amber/40 bg-signal-amber/[0.06]',
  MODERATE: 'text-signal-slate border-signal-slate/40 bg-signal-slate/[0.06]',
  OPTIONAL: 'text-signal-slate border-signal-slate/30 bg-signal-slate/[0.04]',
  UNKNOWN: 'text-signal-slate border-signal-slate/30 bg-signal-slate/[0.04]',
};

const TREND_COLOR: Record<string, string> = {
  DURABLE: 'text-signal-teal border-signal-teal/40 bg-signal-teal/[0.06]',
  GROWING: 'text-signal-amber border-signal-amber/40 bg-signal-amber/[0.06]',
  EMERGING: 'text-signal-amber border-signal-amber/30 bg-signal-amber/[0.04]',
  ROLE_SPECIFIC: 'text-signal-slate border-signal-slate/40 bg-signal-slate/[0.06]',
  DECLINING: 'text-signal-rust border-signal-rust/40 bg-signal-rust/[0.06]',
  UNKNOWN: 'text-signal-slate border-signal-slate/30 bg-signal-slate/[0.04]',
  STABLE: 'text-signal-teal border-signal-teal/40 bg-signal-teal/[0.06]',
  EVOLVING: 'text-signal-amber border-signal-amber/40 bg-signal-amber/[0.06]',
  TRANSFORMING: 'text-signal-rust border-signal-rust/40 bg-signal-rust/[0.06]',
  UNCERTAIN: 'text-signal-slate border-signal-slate/30 bg-signal-slate/[0.04]',
};

export function SeverityTag({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${SEVERITY_COLOR[severity] ?? SEVERITY_COLOR.UNKNOWN}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {severity.replace('_', ' ')}
    </span>
  );
}

export function TrendTag({ classification }: { classification: string }) {
  const arrow = { DURABLE: '=', GROWING: '\u2191', EMERGING: '\u2197', ROLE_SPECIFIC: '\u2022', DECLINING: '\u2193', UNKNOWN: '?', STABLE: '=', EVOLVING: '\u2197', TRANSFORMING: '\u21D1', UNCERTAIN: '?' }[classification] ?? '?';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${TREND_COLOR[classification] ?? TREND_COLOR.UNKNOWN}`}>
      <span aria-hidden>{arrow}</span>
      {classification.replace('_', ' ')}
    </span>
  );
}

export function ConfidenceTag({ confidence }: { confidence: string }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-wide text-inksoft/50">
      {confidence.toLowerCase()} confidence
    </span>
  );
}

export function SourceMetaLine({ meta }: { meta: { period: string; confidence: string; isStale?: boolean } }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-inksoft/50">
      <span>{meta.period}</span>
      <span aria-hidden>&middot;</span>
      <ConfidenceTag confidence={meta.confidence} />
      {meta.isStale && (
        <>
          <span aria-hidden>&middot;</span>
          <span className="text-signal-rust">data may be outdated</span>
        </>
      )}
    </div>
  );
}
