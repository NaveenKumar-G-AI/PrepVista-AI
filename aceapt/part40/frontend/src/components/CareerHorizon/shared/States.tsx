import React from 'react';

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md font-serif text-[15px] leading-relaxed text-inksoft/80">{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-signal-rust/30 bg-signal-rust/[0.04] px-6 py-8 text-center">
      <p className="font-display text-base text-signal-rust">Career Horizon couldn't load</p>
      <p className="mx-auto mt-2 max-w-md font-serif text-[15px] text-inksoft/80">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-full border border-signal-rust/40 px-4 py-1.5 font-mono text-[12px] uppercase tracking-wide text-signal-rust transition hover:bg-signal-rust/10"
        >
          Retry
        </button>
      )}
    </div>
  );
}
