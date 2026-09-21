import React from 'react';

export function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-4xl px-6 py-10 sm:px-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal-amber">{eyebrow}</p>
      <h2 className="mt-1.5 font-display text-2xl text-ink">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

const READINESS_LABEL: Record<string, string> = {
  STRONG: 'Strong', DEVELOPING: 'Developing', NEEDS_ATTENTION: 'Needs attention', UNKNOWN: 'Not enough data yet',
};

export function CurrentPosition({ current }: { current: any }) {
  return (
    <div className="grid gap-6 sm:grid-cols-[1.2fr_1fr]">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-inksoft/50">Validated evidence ({current.evidenceCount})</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {current.capabilities.length === 0 ? (
            <span className="font-serif text-[15px] text-inksoft/60">No demonstrable evidence on file yet.</span>
          ) : (
            current.capabilities.map((c: string) => (
              <span key={c} className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[12px] text-inksoft">{c}</span>
            ))
          )}
        </div>
      </div>
      {current.readiness && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-mono text-[11px] uppercase tracking-wide text-inksoft/50">Future readiness</p>
          <p className="mt-1 font-display text-xl text-ink">{READINESS_LABEL[current.readiness.overall]}</p>
          <dl className="mt-4 space-y-2">
            {Object.entries(current.readiness.dimensions).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 border-t border-line/70 pt-2 first:border-t-0 first:pt-0">
                <dt className="font-serif text-[13px] capitalize text-inksoft/70">{key.replace(/([A-Z])/g, ' $1').trim()}</dt>
                <dd className={`font-mono text-[11px] uppercase ${value === 'STRONG' ? 'text-signal-teal' : value === 'NEEDS_ATTENTION' ? 'text-signal-rust' : 'text-signal-amber'}`}>
                  {READINESS_LABEL[value as string] ?? String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
