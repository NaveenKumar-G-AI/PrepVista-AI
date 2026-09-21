export function EmptyState({ message, detail, onExplore }: { message: string; detail?: string; onExplore: () => void }) {
  return (
    <div className="rounded-lg border border-base-border bg-base-surface p-10 text-center max-w-lg mx-auto mt-12">
      <div className="font-display text-3xl italic text-ink-1">{message}</div>
      {detail && <p className="mt-3 text-sm text-ink-2 font-body">{detail}</p>}
      <button onClick={onExplore} className="mt-6 rounded-md bg-route text-base-bg font-body text-sm font-medium px-5 py-2.5 hover:bg-route-soft transition-colors">
        Explore targets
      </button>
    </div>
  );
}

export function InsufficientDataBanner({ onAssess }: { onAssess: () => void }) {
  return (
    <div className="rounded-lg border border-route/30 bg-route/5 p-4 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <div className="text-sm text-ink-1 font-body">We need more evidence.</div>
        <div className="text-xs text-ink-3 font-body mt-0.5">Your current data isn't enough to build a reliable pathway yet.</div>
      </div>
      <button onClick={onAssess} className="text-xs font-body text-route border border-route/40 rounded-md px-3 py-1.5 hover:bg-route/10 transition-colors shrink-0">
        Complete a targeted assessment
      </button>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-base-border bg-base-surface p-10 text-center max-w-lg mx-auto mt-12">
      <div className="font-display text-2xl italic text-ink-1">Path temporarily unavailable.</div>
      <p className="mt-2 text-sm text-ink-2 font-body">Your existing progress is safe.</p>
      <button onClick={onRetry} className="mt-6 rounded-md border border-base-border text-ink-1 font-body text-sm px-5 py-2.5 hover:bg-base-surface2 transition-colors">
        Retry
      </button>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <div className="text-sm text-ink-3 font-body animate-pulse">Loading your path…</div>
    </div>
  );
}
